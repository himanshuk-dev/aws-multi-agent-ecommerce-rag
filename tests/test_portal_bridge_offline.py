"""Offline bridge contract checks; no AWS clients are constructed."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('portal_bridge', Path(__file__).resolve().parents[1] / 'src' / 'portal_bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class PortalBridgeTests(unittest.TestCase):
    def test_reuses_existing_runtime_adapter_and_returns_customer_text(self):
        invoke = MagicMock(return_value={'result': 'Your actual agent answer.'})
        with patch.dict(sys.modules, agent_orchestrator=types.SimpleNamespace(invoke_agent=invoke)):
            result = bridge.handle({'action': 'chat', 'customerId': 'CUST-001', 'sessionId': 'server-session', 'message': 'Track my order'})
        invoke.assert_called_once_with('server-session', 'CUST-001', 'Track my order')
        self.assertEqual(result, {'reply': 'Your actual agent answer.', 'sessionId': 'server-session'})

    def test_runtime_errors_and_missing_text_are_not_fabricated(self):
        for response in [{'error': 'rejected'}, {}, {'result': ''}, {'result': None}]:
            with self.subTest(response=response), self.assertRaises(RuntimeError):
                bridge.handle({'action': 'chat', 'customerId': 'CUST-001', 'sessionId': 'server-session', 'message': 'hello'}, invoke=MagicMock(return_value=response))

    def test_order_normalization_does_not_invent_tracking_events(self):
        row = bridge.normalize_order({'order_id': 'ORD-12142', 'status': 'return_requested', 'estimated_delivery': '2026-10-20', 'quantity': '1', 'price': '149.99'})
        self.assertEqual(row['status'], 'return_requested')
        self.assertEqual(row['events'], [])
        self.assertIsNone(row['destination'])
        self.assertEqual(row['deliveryDateKind'], 'estimated')
        self.assertEqual(row['price'], 149.99)
        missing = bridge.normalize_order({'order_id': 'ORD-EMPTY', 'status': 'unrecognized'})
        self.assertEqual(missing['status'], 'unknown')
        for key in ['price', 'quantity', 'deliveryDate', 'trackingNumber', 'placedAt']:
            self.assertIsNone(missing[key])

    def test_queries_only_authorized_customer_and_paginates(self):
        resource = MagicMock()
        table = resource.Table.return_value
        table.query.side_effect = [
            {'Items': [{'order_id': 'ORD-1', 'order_date': '2026-10-20'}], 'LastEvaluatedKey': {'customer_id': 'CUST-001', 'order_id': 'ORD-1'}},
            {'Items': [{'order_id': 'ORD-2', 'order_date': '2026-10-21'}]},
        ]
        config = types.SimpleNamespace(ORDERS_TABLE='orders', CUSTOMERS_TABLE='customers')
        with patch.dict(sys.modules, config=config):
            orders = bridge.handle({'action': 'orders', 'customerId': 'CUST-001'}, resource=resource)
        self.assertEqual([row['id'] for row in orders], ['ORD-2', 'ORD-1'])
        expression = table.query.call_args_list[0].kwargs['KeyConditionExpression'].get_expression()
        self.assertEqual(expression['values'][1], 'CUST-001')
        self.assertEqual(table.query.call_args_list[1].kwargs['ExclusiveStartKey']['customer_id'], 'CUST-001')
        self.assertTrue(table.query.call_args.kwargs['ConsistentRead'])

    def test_customer_lookup_uses_server_mapping_and_reports_missing_record(self):
        resource = MagicMock()
        resource.Table.return_value.get_item.return_value = {'Item': {'name': 'Customer', 'tier': 'Premium'}}
        with patch.dict(sys.modules, config=types.SimpleNamespace(CUSTOMERS_TABLE='customers')):
            result = bridge.handle({'action': 'customer', 'customerId': 'CUST-001'}, resource=resource)
            self.assertEqual(result['id'], 'CUST-001')
            self.assertEqual(result['mode'], 'agentcore')
            resource.Table.return_value.get_item.assert_called_once_with(Key={'customer_id': 'CUST-001'}, ConsistentRead=True)
            resource.Table.return_value.get_item.return_value = {}
            with self.assertRaises(RuntimeError):
                bridge.handle({'action': 'customer', 'customerId': 'CUST-001'}, resource=resource)

    def test_rejects_missing_identity_and_unknown_actions(self):
        for request in [{'action': 'orders'}, {'action': 'deploy', 'customerId': 'CUST-001'}]:
            with self.assertRaises(ValueError):
                bridge.handle(request)


if __name__ == '__main__':
    with patch('botocore.httpsession.URLLib3Session.send', side_effect=AssertionError('AWS transport forbidden')) as transport:
        result = unittest.main(exit=False).result
    if transport.called:
        print('FAIL: AWS transport attempted during bridge tests')
        sys.exit(1)
    print('AWS transport guard: PASS (0 AWS requests)')
    sys.exit(0 if result.wasSuccessful() else 1)
