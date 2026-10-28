"""Server-only JSON bridge for the local portal. Never deploys or provisions AWS.

Read one request from stdin and write one JSON result to stdout. AWS access and
customer selection remain in the local backend, never in browser configuration.
"""
import contextlib
import json
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path[:0] = [str(Path(__file__).resolve().parent), str(Path(__file__).resolve().parents[1])]


def optional_date(value):
    try:
        return date.fromisoformat(str(value)).isoformat()
    except (TypeError, ValueError):
        return None


def optional_number(value):
    try:
        result = float(value)
        return result if result >= 0 and result != float('inf') else None
    except (TypeError, ValueError):
        return None


def normalize_order(item):
    """Expose recorded facts only; do not invent carrier events or arrival dates."""
    status = item.get('status')
    known = {'processing', 'shipped', 'in_transit', 'delivered', 'return_requested', 'cancelled'}
    return {
        'id': item['order_id'],
        'product': item.get('product_name') or 'Product name unavailable',
        'category': item.get('product_category') or '',
        'quantity': optional_number(item.get('quantity')),
        'price': optional_number(item.get('price')),
        'status': status if status in known else 'unknown',
        'placedAt': optional_date(item.get('order_date')),
        # estimated_delivery is not a confirmed delivered-at timestamp.
        'deliveryDate': optional_date(item.get('estimated_delivery')),
        'deliveryDateKind': 'estimated',
        'trackingNumber': item.get('tracking_number') or None,
        'destination': None,
        'events': [],  # The project's Orders table has no carrier event history.
    }


def handle(request, resource=None, invoke=None):
    customer_id = request.get('customerId')
    if not isinstance(customer_id, str) or not customer_id.strip():
        raise ValueError('A server-authorized customer is required')
    action = request.get('action')
    if action not in {'customer', 'orders', 'chat'}:
        raise ValueError('Unsupported portal action')
    if action == 'chat':
        if invoke is None:
            # Reuse the implemented project Runtime adapter without changing it.
            from agent_orchestrator import invoke_agent
            invoke = invoke_agent
        response = invoke(request['sessionId'], customer_id, request['message'])
        if not isinstance(response, dict) or response.get('error'):
            raise RuntimeError('AgentCore did not return a successful response')
        reply = response.get('result')
        if not isinstance(reply, str) or not reply.strip():
            raise RuntimeError('AgentCore response contains no customer-facing text')
        return {'reply': reply, 'sessionId': request['sessionId']}

    import config
    if resource is None:
        import boto3
        from botocore.config import Config
        resource = boto3.resource('dynamodb', region_name=config.AWS_REGION,
                                  config=Config(connect_timeout=5, read_timeout=20,
                                                retries={'max_attempts': 1}))
    if action == 'customer':
        item = resource.Table(config.CUSTOMERS_TABLE).get_item(
            Key={'customer_id': customer_id}, ConsistentRead=True).get('Item')
        if not item:
            raise RuntimeError('Authorized customer record was not found')
        return {'id': customer_id, 'name': item.get('name') or customer_id,
                'email': item.get('email') or '', 'tier': item.get('tier') or 'Unknown',
                'mode': 'agentcore'}
    from boto3.dynamodb.conditions import Key
    table = resource.Table(config.ORDERS_TABLE)
    items = []
    args = {'KeyConditionExpression': Key('customer_id').eq(customer_id), 'ConsistentRead': True}
    while True:
        page = table.query(**args)
        items.extend(page.get('Items', []))
        cursor = page.get('LastEvaluatedKey')
        if not cursor:
            break
        args['ExclusiveStartKey'] = cursor
    return [normalize_order(item) for item in sorted(
        items, key=lambda item: (item.get('order_date', ''), item['order_id']), reverse=True)]


def main():
    try:
        request = json.loads(sys.stdin.read(8192))
        # Project imports and SDK/agent output must not corrupt the JSON protocol
        # or leak prompts/customer data into the API process logs.
        with contextlib.redirect_stdout(sys.stderr):
            result = handle(request)
        print(json.dumps({'ok': True, 'data': result}, default=lambda value: float(value) if isinstance(value, Decimal) else str(value)))
    except Exception:
        # No AWS error detail, ARN, credentials, or user prompt crosses the wire.
        print(json.dumps({'ok': False, 'error': 'The project backend is unavailable. Check local AWS authentication and runtime configuration.'}))
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
