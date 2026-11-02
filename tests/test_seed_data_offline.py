"""Restoration seed safety: importing this module must not create AWS clients."""
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError


class SeedDataTests(unittest.TestCase):
    def setUp(self):
        path = Path(__file__).resolve().parents[1] / 'infrastructure/seed_data.py'
        spec = importlib.util.spec_from_file_location('seed_data_under_test', path)
        self.seed = importlib.util.module_from_spec(spec)
        with patch('boto3.client', side_effect=AssertionError('AWS client')), \
             patch('boto3.resource', side_effect=AssertionError('AWS resource')):
            spec.loader.exec_module(self.seed)

    def test_documented_duplicate_and_delivered_orders(self):
        orders = {o['order_id']: o for o in self.seed.generate_orders()}
        self.assertEqual(set(orders), {'ORD-12142', 'ORD-59651'})
        duplicate = orders['ORD-12142']
        self.assertEqual(duplicate['product_name'], 'Wireless Headphones Pro')
        self.assertEqual(duplicate['status'], 'return_requested')
        self.assertEqual(duplicate['return_eligible'], 'false')
        delivered = orders['ORD-59651']
        self.assertEqual(delivered['product_name'], 'Bluetooth Speaker')
        self.assertEqual(delivered['status'], 'delivered')
        self.assertEqual(delivered['return_eligible'], 'true')
        self.assertTrue(all(o['customer_id'] == 'CUST-001' for o in orders.values()))

    def test_insert_is_conditional(self):
        table = Mock()
        order = self.seed.generate_orders()[0]
        self.assertTrue(self.seed.insert_if_missing(table, order))
        table.put_item.assert_called_once_with(
            Item=order, ConditionExpression='attribute_not_exists(#key)',
            ExpressionAttributeNames={'#key': 'order_id'})

    def test_existing_record_is_preserved(self):
        table = Mock()
        table.put_item.side_effect = ClientError(
            {'Error': {'Code': 'ConditionalCheckFailedException'}}, 'PutItem')
        self.assertFalse(self.seed.insert_if_missing(table, self.seed.CUSTOMERS[0]))
        self.assertEqual(table.put_item.call_count, 1)
        table.update_item.assert_not_called()

    def test_other_write_errors_propagate(self):
        table = Mock()
        table.put_item.side_effect = ClientError(
            {'Error': {'Code': 'AccessDeniedException'}}, 'PutItem')
        with self.assertRaises(ClientError):
            self.seed.insert_if_missing(table, self.seed.CUSTOMERS[0])


if __name__ == '__main__':
    unittest.main()
