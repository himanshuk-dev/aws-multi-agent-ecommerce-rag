"""Offline reconciliation checks. Run directly; all AWS operations are blocked."""
import importlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT), str(ROOT / 'tests')]


class CompatibilityTests(unittest.TestCase):
    def test_existing_task2_regression(self):
        regression = importlib.import_module('test_agent')
        regression.score.update(earned=0, possible=0)
        result = unittest.TestResult()
        unittest.defaultTestLoader.loadTestsFromTestCase(regression.TestTask2).run(result)
        self.assertTrue(result.wasSuccessful(), (result.errors, result.failures))
        self.assertEqual(regression.score, {'earned': 40, 'possible': 40})

    def test_cli_chat_turn_and_exit(self):
        import contextlib
        import runpy
        output = io.StringIO()
        resource = MagicMock()
        resource.Table.return_value.get_item.return_value = {'Item': {'communication_agent': 'Offline reply'}}
        with patch.object(sys, 'argv', ['agent_orchestrator.py', 'chat']), patch('builtins.input', side_effect=['', 'hello', 'quit']), patch('strands.Agent', return_value=MagicMock()), patch('boto3.resource', return_value=resource), contextlib.redirect_stdout(output), patch('agent_utils._real_stdout', output):
            runpy.run_path(str(ROOT / 'src/agent_orchestrator.py'), run_name='__main__')
        self.assertIn('Offline reply', output.getvalue())
        self.assertIn('Session ended.', output.getvalue())

    def test_graph_wires_existing_builders(self):
        names = ['inventory', 'refund', 'policy', 'communication']
        workers = [object() for _ in names]
        from contextlib import ExitStack
        with ExitStack() as stack:
            for name, worker in zip(names, workers):
                stack.enter_context(patch.object(ao, f'build_{name}_agent', return_value=worker))
            builder = stack.enter_context(patch.object(ao, 'build_orchestrator_agent'))
            self.assertIs(ao.build_agent_graph(), builder.return_value)
            builder.assert_called_once_with(*workers)

    def test_invoke_matches_botocore_contract(self):
        from botocore.stub import Stubber, ANY
        body = {'result': 'reply', 'session_id': 'session'}
        with patch.object(config, 'AGENTCORE_RUNTIME_ARN', 'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/test'), Stubber(ao.agentcore_client) as stub:
            stub.add_response('invoke_agent_runtime', {'response': io.BytesIO(json.dumps(body).encode()), 'contentType': 'application/json'}, {
                'agentRuntimeArn': config.AGENTCORE_RUNTIME_ARN,
                'runtimeSessionId': ANY, 'contentType': 'application/json',
                'accept': 'application/json', 'payload': json.dumps({'prompt': 'hello', 'session_id': 'session', 'customer_id': 'CUST-001'}),
            })
            self.assertEqual(ao.invoke_agent('session', 'CUST-001', 'hello'), body)
            stub.assert_no_pending_responses()

    def test_runtime_session_id_is_stable_valid_and_isolated(self):
        session_ids = ['short', 'other', 'session/with spaces:é', 'x' * 1000]
        runtime_ids = []
        with patch.object(config, 'AGENTCORE_RUNTIME_ARN', 'offline-runtime'), patch.object(ao.agentcore_client, 'invoke_agent_runtime') as invoke, patch.object(ao.uuid, 'uuid4', side_effect=AssertionError('Session IDs must be deterministic')):
            invoke.side_effect = lambda **kwargs: {'response': io.BytesIO(b'{"result": "reply"}')}
            for session_id in session_ids:
                ao.invoke_agent(session_id, 'customer', 'first turn')
                first = invoke.call_args.kwargs['runtimeSessionId']
                ao.invoke_agent(session_id, 'customer', 'second turn')
                self.assertEqual(invoke.call_args.kwargs['runtimeSessionId'], first)
                self.assertRegex(first, r'^[0-9a-f]{64}$')
                self.assertGreaterEqual(len(first), 33)
                self.assertLessEqual(len(first), 256)
                self.assertNotEqual(first, session_id)
                runtime_ids.append(first)
            self.assertEqual(len(set(runtime_ids)), len(session_ids))

    def test_runtime_adapter_requires_customer_id_before_work(self):
        app = MagicMock()
        handlers = []
        app.entrypoint.side_effect = lambda fn: handlers.append(fn) or fn
        sdk = types.ModuleType('bedrock_agentcore')
        sdk.BedrockAgentCoreApp = MagicMock(return_value=app)
        with patch.dict(sys.modules, bedrock_agentcore=sdk), patch.object(ao, 'build_agent_graph') as graph, patch.object(ao, '_read_workflow_state') as read_state:
            ao.run_serve()
            for payload in [
                {'prompt': 'hello'},
                *({'prompt': 'hello', 'customer_id': value} for value in
                  [None, '', '  \t\n', 123, False, [], {}]),
            ]:
                with self.subTest(payload=payload):
                    self.assertEqual(handlers[0](payload), {'error': 'customer_id must be a nonempty string'})
            graph.assert_not_called()
            read_state.assert_not_called()

    def test_runtime_adapter(self):
        app = MagicMock()
        handlers = []
        app.entrypoint.side_effect = lambda fn: handlers.append(fn) or fn
        sdk = types.ModuleType('bedrock_agentcore')
        sdk.BedrockAgentCoreApp = MagicMock(return_value=app)
        with patch.dict(sys.modules, bedrock_agentcore=sdk), patch.object(ao, 'build_agent_graph') as graph, patch.object(ao, '_read_workflow_state', return_value={'communication_agent': '<answer>Done</answer>'}):
            ao.run_serve()
            app.run.assert_called_once_with()
            invoke = handlers[0]
            self.assertIn('error', invoke(None))
            graph.assert_not_called()
            response = invoke({'prompt': 'hello', 'session_id': 'session', 'customer_id': 'customer'})
            graph.return_value.assert_called_once_with('[Session ID: session] [Customer ID: customer] hello')
            self.assertEqual(response, {'result': 'Done', 'session_id': 'session', 'customer_id': 'customer'})

    def test_packaged_marker_selects_serve(self):
        import runpy
        sdk = types.ModuleType('bedrock_agentcore')
        sdk.BedrockAgentCoreApp = MagicMock()
        exists = os.path.exists
        with patch.dict(sys.modules, bedrock_agentcore=sdk), patch.object(sys, 'argv', ['agent_orchestrator.py']), patch('os.path.exists', side_effect=lambda path: str(path).endswith(cli.RUNTIME_MARKER) or exists(path)):
            runpy.run_path(str(ROOT / 'src/agent_orchestrator.py'), run_name='__main__')
        sdk.BedrockAgentCoreApp.return_value.run.assert_called_once_with()

    def test_cli_staging_and_config_interfaces(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(cli, 'RUNTIME_CODE_DIR', directory + '/runtime'):
            staged = Path(cli.stage_runtime_code())
            self.assertTrue((staged / cli.RUNTIME_MARKER).exists())
            self.assertTrue((staged / cli.RUNTIME_ENTRYPOINT).exists())
            self.assertIn('bedrock-agentcore', (staged / 'pyproject.toml').read_text())
        spec = cli.read_project_config()
        self.assertIn(cli.runtime_spec(spec), spec['runtimes'])
        self.assertEqual(len(spec['runtimes']), 1)
        self.assertEqual(cli.stack_name(), 'AgentCore-udacity-default')

    def test_helper_readiness_and_failure(self):
        ctl = MagicMock()
        ctl.get_agent_runtime.return_value = {'status': 'READY'}
        self.assertEqual(ao.wait_for_runtime_ready(ctl, 'test'), 'READY')
        ctl.get_agent_runtime.return_value = {'status': 'CREATE_FAILED'}
        with self.assertRaises(RuntimeError):
            ao.wait_for_runtime_ready(ctl, 'test')
        self.assertTrue(callable(ao.apply_observability_config))

    def test_deployment_remains_unimplemented_without_writes(self):
        with self.assertRaises(NotImplementedError):
            ao.deploy_to_agentcore_runtime(None, 'guardrail', '1')

    def test_no_fabricated_data_plane_methods(self):
        self.assertFalse(hasattr(ao.agentcore_client, 'get_agent_runtime'))
        self.assertFalse(hasattr(ao.agentcore_client, 'put_agent_runtime_logging_configuration'))


def main():
    global config, ao, cli
    from botocore.endpoint import Endpoint
    env = {'AWS_ACCESS_KEY_ID': 'offline', 'AWS_SECRET_ACCESS_KEY': 'offline', 'AWS_SESSION_TOKEN': 'offline', 'AWS_EC2_METADATA_DISABLED': 'true', 'AWS_DEFAULT_REGION': 'us-east-1'}
    with patch.dict(os.environ, env), patch('dotenv.load_dotenv'), patch.object(Endpoint, '_send', side_effect=AssertionError('AWS calls forbidden in offline tests')):
        fake = MagicMock()
        fake.get_caller_identity.return_value = {'Account': '123456789012'}
        keys = ['OrdersTable', 'CustomersTable', 'WorkflowStateTable', 'PolicyBucket', 'VectorBucket', 'AgentCoreRoleArn', 'AgentLogGroup']
        fake.get_paginator.return_value.paginate.return_value = [{'Exports': [{'Name': f'udacity-agentcore-{key}', 'Value': 'offline-' + key} for key in keys]}]
        with patch.dict(os.environ, PROJECT_NAME='udacity-agentcore'), patch('boto3.client', return_value=fake):
            config = importlib.import_module('config')
        ao = importlib.import_module('agent_orchestrator')
        cli = importlib.import_module('agentcore_cli')
        unittest.main()


if __name__ == '__main__':
    main()
