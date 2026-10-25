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
from unittest.mock import MagicMock, call, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT), str(ROOT / 'tests')]


class CompatibilityTests(unittest.TestCase):
    def test_all_eight_models_use_published_guardrail_and_original_settings(self):
        expected = [
            (config.WORKER_MODEL_ID, 0.1),  # inventory
            (config.WORKER_MODEL_ID, 0.1),  # refund
            (config.WORKER_MODEL_ID, 0.0),  # returns retriever
            (config.WORKER_MODEL_ID, 0.0),  # shipping retriever
            (config.WORKER_MODEL_ID, 0.0),  # warranty retriever
            (config.WORKER_MODEL_ID, 0.2),  # policy coordinator
            (config.WORKER_MODEL_ID, 0.3),  # communication
            (config.ORCHESTRATOR_MODEL_ID, 0.0),
        ]
        for guardrail_id, version in [('guardrail-test', '12'), ('', '')]:
            with self.subTest(guardrail_configured=bool(guardrail_id)), patch.object(config, 'GUARDRAIL_ID', guardrail_id), patch.object(config, 'GUARDRAIL_VERSION', version), patch.object(ao, 'BedrockModel', wraps=ao.BedrockModel) as model:
                ao.build_agent_graph()
                self.assertEqual(model.call_count, 8)
                for call, (model_id, temperature) in zip(model.call_args_list, expected):
                    kwargs = {'model_id': model_id, 'temperature': temperature, 'region_name': config.AWS_REGION}
                    if guardrail_id:
                        kwargs.update(guardrail_id=guardrail_id, guardrail_version=version)
                    self.assertEqual(call.kwargs, kwargs)

    def test_guardrail_configuration_fails_before_model_creation(self):
        for guardrail_id, version, message in [
            ('guardrail-test', '', 'must both be configured'),
            ('', '1', 'must both be configured'),
            ('', 'DRAFT', 'must both be configured'),
            *[('guardrail-test', version, 'published positive numeric version')
              for version in ['DRAFT', '0', '-1', '1.0', 'abc', ' 1 ', '١', 1]],
        ]:
            with self.subTest(version=version, id_configured=bool(guardrail_id)), patch.object(config, 'GUARDRAIL_ID', guardrail_id), patch.object(config, 'GUARDRAIL_VERSION', version), patch.object(ao, 'BedrockModel') as model:
                with self.assertRaisesRegex(ValueError, message):
                    ao._build_bedrock_model(config.WORKER_MODEL_ID, 0.1)
                model.assert_not_called()

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

    def test_no_fabricated_data_plane_methods(self):
        self.assertFalse(hasattr(ao.agentcore_client, 'get_agent_runtime'))
        self.assertFalse(hasattr(ao.agentcore_client, 'put_agent_runtime_logging_configuration'))



class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.settings = {
            'AWS_REGION': 'us-east-1',
            'PROJECT_NAME': 'offline-project',
            'RETURNS_KB_ID': 'returns-kb',
            'SHIPPING_KB_ID': 'shipping-kb',
            'WARRANTY_KB_ID': 'warranty-kb',
            'AGENT_LOG_GROUP': '/offline/agent',
            'AGENTCORE_ROLE_ARN': 'arn:aws:iam::123456789012:role/offline',
        }
        settings_patch = patch.multiple(config, **self.settings)
        settings_patch.start()
        self.addCleanup(settings_patch.stop)
        cli_patch = patch.object(ao, 'agentcore_cli', autospec=True)
        self.cli = cli_patch.start()
        self.addCleanup(cli_patch.stop)
        self.arn = 'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/offline'
        self.cli.deployed_runtime_arn.return_value = self.arn

    def test_deployment_sequence_and_configuration(self):
        with patch.object(config, 'GUARDRAIL_ID', 'ignore-config-id'), patch.object(config, 'GUARDRAIL_VERSION', 'DRAFT'):
            result = ao.deploy_to_agentcore_runtime(object(), 'published-id', '12')
        self.assertEqual(result, self.arn)
        expected_env = {key: value for key, value in self.settings.items() if key != 'AGENTCORE_ROLE_ARN'}
        expected_env.update(GUARDRAIL_ID='published-id', GUARDRAIL_VERSION='12')
        self.assertEqual(self.cli.mock_calls, [
            call.stage_runtime_code(),
            call.configure_runtime(env_vars=expected_env, network_mode='PUBLIC', protocol='HTTP', execution_role_arn=self.settings['AGENTCORE_ROLE_ARN']),
            call.deploy(),
            call.deployed_runtime_arn(),
        ])

    def test_empty_kb_ids_are_allowed_before_task5(self):
        with patch.multiple(config, RETURNS_KB_ID='', SHIPPING_KB_ID='', WARRANTY_KB_ID=''):
            self.assertEqual(ao.deploy_to_agentcore_runtime(None, 'guardrail', '1'), self.arn)
        env = self.cli.configure_runtime.call_args.kwargs['env_vars']
        for key in ('RETURNS_KB_ID', 'SHIPPING_KB_ID', 'WARRANTY_KB_ID'):
            self.assertEqual(env[key], '')

    def test_guardrail_validation_precedes_all_cli_operations(self):
        for guardrail_id in ['', '  ', None, 123]:
            with self.subTest(guardrail_id=guardrail_id):
                with self.assertRaisesRegex(ValueError, 'GUARDRAIL_ID'):
                    ao.deploy_to_agentcore_runtime(None, guardrail_id, '1')
        for version in ['', None, 'DRAFT', '0', '-1', '01', '1.0', 'abc', ' 1 ', '١', 1, True]:
            with self.subTest(version=version):
                with self.assertRaisesRegex(ValueError, 'GUARDRAIL_VERSION.*published positive integer'):
                    ao.deploy_to_agentcore_runtime(None, 'guardrail', version)
        self.assertEqual(self.cli.mock_calls, [])

    def test_missing_runtime_configuration_precedes_cli_operations(self):
        for name in ('AWS_REGION', 'PROJECT_NAME', 'AGENT_LOG_GROUP', 'AGENTCORE_ROLE_ARN'):
            for value in ['', '  ', None]:
                with self.subTest(name=name, value=value), patch.object(config, name, value):
                    with self.assertRaisesRegex(ValueError, name):
                        ao.deploy_to_agentcore_runtime(None, 'guardrail', '1')
        self.assertEqual(self.cli.mock_calls, [])

    def test_missing_runtime_arn_raises_clear_error(self):
        for value in ['', '  ', None]:
            with self.subTest(value=value):
                self.cli.deployed_runtime_arn.return_value = value
                with self.assertRaisesRegex(RuntimeError, 'no runtime ARN'):
                    ao.deploy_to_agentcore_runtime(None, 'guardrail', '1')

    def test_cli_errors_propagate_and_stop_sequence(self):
        steps = ['stage_runtime_code', 'configure_runtime', 'deploy', 'deployed_runtime_arn']
        for index, step in enumerate(steps):
            with self.subTest(step=step):
                self.cli.reset_mock(side_effect=True)
                failure = RuntimeError(f'{step} failed')
                getattr(self.cli, step).side_effect = failure
                with self.assertRaises(RuntimeError) as caught:
                    ao.deploy_to_agentcore_runtime(None, 'guardrail', '1')
                self.assertIs(caught.exception, failure)
                self.assertEqual([entry[0] for entry in self.cli.mock_calls], steps[:index + 1])



class MemoryTests(unittest.TestCase):
    def setUp(self):
        self.real_control = ao.agentcore_control
        control_patch = patch.object(ao, 'agentcore_control', spec=ao.agentcore_control)
        self.control = control_patch.start()
        self.addCleanup(control_patch.stop)
        namespace_patch = patch.object(config, 'MEMORY_NAMESPACE', 'novamart-memory')
        namespace_patch.start()
        self.addCleanup(namespace_patch.stop)
        sleep_patch = patch.object(ao.time, 'sleep')
        self.sleep = sleep_patch.start()
        self.addCleanup(sleep_patch.stop)
        self.memory_id = 'novamart_memory-ABCDEFGHIJ'
        self.arn = f'arn:aws:bedrock-agentcore:us-east-1:123456789012:memory/{self.memory_id}'
        self.control.list_memories.return_value = {'memories': []}
        self.control.create_memory.return_value = {'memory': self.memory('ACTIVE')}

    def memory(self, status):
        from datetime import datetime, timezone
        return {
            'id': self.memory_id, 'arn': self.arn, 'name': 'novamart_memory',
            'eventExpiryDuration': 7, 'status': status,
            'createdAt': datetime(2026, 1, 1, tzinfo=timezone.utc),
            'updatedAt': datetime(2026, 1, 1, tzinfo=timezone.utc),
        }

    def test_creation_matches_installed_service_model_and_activates(self):
        from botocore.stub import Stubber, ANY
        expected = {
            'name': 'novamart_memory',
            'description': 'NovaMart customer-support session summaries with seven-day event retention',
            'eventExpiryDuration': 7,
            'memoryStrategies': [{'summaryMemoryStrategy': {
                'name': 'SessionSummary',
                'description': 'Summarize each customer conversation session',
                'namespaces': ['/summaries/{actorId}/{sessionId}/'],
            }}],
            'clientToken': ANY,
        }
        with patch.object(ao, 'agentcore_control', self.real_control), Stubber(self.real_control) as stub:
            stub.add_response('list_memories', {'memories': []}, {})
            stub.add_response('create_memory', {'memory': self.memory('CREATING')}, expected)
            stub.add_response('get_memory', {'memory': self.memory('CREATING')}, {'memoryId': self.memory_id})
            stub.add_response('get_memory', {'memory': self.memory('ACTIVE')}, {'memoryId': self.memory_id})
            self.assertEqual(ao.configure_memory('offline-runtime'), self.arn)
            stub.assert_no_pending_responses()
        self.assertEqual(self.sleep.call_args_list, [call(10), call(10)])

    def test_existing_active_memory_is_reused(self):
        self.control.list_memories.return_value = {'memories': [self.memory('ACTIVE')]}
        self.assertEqual(ao.configure_memory('offline-runtime'), self.arn)
        self.control.create_memory.assert_not_called()
        self.control.get_memory.assert_not_called()
        self.sleep.assert_not_called()

    def test_existing_resource_is_found_on_later_page_and_awaited(self):
        unrelated = dict(self.memory('ACTIVE'), id='novamart_memory_other-ABCDEFGHIJ')
        self.control.list_memories.side_effect = [
            {'memories': [unrelated], 'nextToken': 'next-page'},
            {'memories': [self.memory('UPDATING')]},
        ]
        self.control.get_memory.return_value = {'memory': self.memory('ACTIVE')}
        self.assertEqual(ao.configure_memory('offline-runtime'), self.arn)
        self.assertEqual(self.control.list_memories.call_args_list, [call(), call(nextToken='next-page')])
        self.control.get_memory.assert_called_once_with(memoryId=self.memory_id)
        self.control.create_memory.assert_not_called()

    def test_client_token_is_stable_for_identical_creation_requests(self):
        self.assertEqual(ao.configure_memory('offline-runtime'), self.arn)
        first = self.control.create_memory.call_args.kwargs
        self.assertRegex(first['clientToken'], r'^[0-9a-f]{64}$')
        self.assertEqual(ao.configure_memory('offline-runtime'), self.arn)
        self.assertEqual(first, self.control.create_memory.call_args.kwargs)

    def test_failed_or_deleting_existing_resource_is_not_returned(self):
        for status in ['FAILED', 'DELETING']:
            with self.subTest(status=status):
                self.control.list_memories.return_value = {'memories': [self.memory(status)]}
                with self.assertRaisesRegex(RuntimeError, status):
                    ao.configure_memory('offline-runtime')
        self.control.create_memory.assert_not_called()

    def test_creation_and_activation_failures_are_reported(self):
        self.control.create_memory.return_value = {'memory': dict(self.memory('FAILED'), failureReason='strategy failed')}
        with self.assertRaisesRegex(RuntimeError, 'FAILED: strategy failed'):
            ao.configure_memory('offline-runtime')
        self.control.create_memory.return_value = {'memory': self.memory('CREATING')}
        self.control.get_memory.return_value = {'memory': dict(self.memory('FAILED'), failureReason='activation failed')}
        with self.assertRaisesRegex(RuntimeError, 'FAILED: activation failed'):
            ao.configure_memory('offline-runtime')

    def test_aws_api_errors_propagate_without_false_success(self):
        from botocore.exceptions import ClientError
        for method in ['list_memories', 'create_memory', 'get_memory']:
            with self.subTest(method=method):
                self.control.reset_mock(side_effect=True)
                self.control.create_memory.return_value = {'memory': self.memory('CREATING')}
                error = ClientError({'Error': {'Code': 'AccessDeniedException', 'Message': 'denied'}}, method)
                getattr(self.control, method).side_effect = error
                with self.assertRaises(ClientError) as caught:
                    ao.configure_memory('offline-runtime')
                self.assertIs(caught.exception, error)

    def test_activation_polling_is_bounded(self):
        self.control.create_memory.return_value = {'memory': self.memory('CREATING')}
        self.control.get_memory.return_value = {'memory': self.memory('CREATING')}
        with self.assertRaisesRegex(TimeoutError, '30 polls'):
            ao.configure_memory('offline-runtime')
        self.assertEqual(self.control.get_memory.call_count, 30)
        self.assertEqual(self.sleep.call_args_list, [call(10)] * 30)

    def test_malformed_responses_do_not_return_success(self):
        for response in [{}, {'memory': {'id': self.memory_id}}, {'memory': {'arn': self.arn}}]:
            with self.subTest(response=response):
                self.control.create_memory.return_value = response
                with self.assertRaisesRegex(RuntimeError, 'missing its id or ARN'):
                    ao.configure_memory('offline-runtime')
        self.control.create_memory.return_value = {'memory': self.memory('CREATING')}
        self.control.get_memory.return_value = {'memory': {}}
        with self.assertRaisesRegex(RuntimeError, 'missing its status'):
            ao.configure_memory('offline-runtime')


def main():
    global config, ao, cli
    from botocore.endpoint import Endpoint
    env = {'AWS_ACCESS_KEY_ID': 'offline', 'AWS_SECRET_ACCESS_KEY': 'offline', 'AWS_SESSION_TOKEN': 'offline', 'AWS_EC2_METADATA_DISABLED': 'true', 'AWS_DEFAULT_REGION': 'us-east-1', 'GUARDRAIL_ID': '', 'GUARDRAIL_VERSION': ''}
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
