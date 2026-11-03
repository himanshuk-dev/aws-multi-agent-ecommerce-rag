"""
seed_data.py
============
Pre-deployment script run by Udacity workspace provisioner.
Seeds DynamoDB tables with realistic mock customer support data
and uploads policy documents to S3 for the RAG pipeline.

Run explicitly after provisioning the foundation. Existing records are preserved.
"""

import boto3
import json
import os
import sys
from datetime import datetime, timedelta

from botocore.exceptions import ClientError

PROJECT_NAME = os.environ.get('PROJECT_NAME', 'udacity-agentcore')
REGION = os.environ.get('AWS_REGION', 'us-east-1')
dynamodb = None
s3 = None
POLICY_BUCKET = None


def initialize_clients():
    """Resolve the deployed bucket rather than reconstructing its name."""
    global dynamodb, s3, POLICY_BUCKET
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    s3 = boto3.client('s3', region_name=REGION)
    cf = boto3.client('cloudformation', region_name=REGION)
    exports = {e['Name']: e['Value']
               for page in cf.get_paginator('list_exports').paginate()
               for e in page['Exports']}
    POLICY_BUCKET = exports[f'{PROJECT_NAME}-PolicyBucket']


def insert_if_missing(table, item):
    """Never overwrite an existing customer or reset an existing order."""
    key = 'order_id' if 'order_id' in item else 'customer_id'
    try:
        table.put_item(Item=item, ConditionExpression='attribute_not_exists(#key)',
                       ExpressionAttributeNames={'#key': key})
        return True
    except ClientError as exc:
        if exc.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return False
        raise

# ─────────────────────────────────────────────
# MOCK CUSTOMER DATA
# ─────────────────────────────────────────────
CUSTOMERS = [
    {
        "customer_id": "CUST-001",
        "name": "Alice Johnson",
        "email": "alice@example.com",
        "tier": "Premium",
        "account_created": "2021-03-15",
        "total_orders": 47,
        "preferred_contact": "email"
    },
    {
        "customer_id": "CUST-002",
        "name": "Bob Martinez",
        "email": "bob@example.com",
        "tier": "Standard",
        "account_created": "2022-08-01",
        "total_orders": 12,
        "preferred_contact": "phone"
    },
    {
        "customer_id": "CUST-003",
        "name": "Carol Chen",
        "email": "carol@example.com",
        "tier": "Premium",
        "account_created": "2020-11-20",
        "total_orders": 103,
        "preferred_contact": "email"
    },
    {
        "customer_id": "CUST-004",
        "name": "David Kim",
        "email": "david@example.com",
        "tier": "Standard",
        "account_created": "2023-01-07",
        "total_orders": 5,
        "preferred_contact": "email"
    },
]

# ─────────────────────────────────────────────
# MOCK ORDER DATA
# ─────────────────────────────────────────────
PRODUCTS = [
    ("Wireless Headphones Pro", 149.99, "Electronics"),
    ("Running Shoes X200", 89.99, "Footwear"),
    ("Coffee Maker Deluxe", 79.99, "Appliances"),
    ("Yoga Mat Premium", 34.99, "Sports"),
    ("Smart Watch Series 5", 299.99, "Electronics"),
    ("Backpack Explorer", 59.99, "Accessories"),
    ("Bluetooth Speaker", 49.99, "Electronics"),
    ("Desk Lamp LED", 29.99, "Home"),
]

STATUSES = ["delivered", "shipped", "processing", "cancelled", "return_requested"]

def generate_orders():
    """Recreate fictional demo records, not recover deleted production data.

    Stable IDs match the documented scenarios. Dates are relative only when a
    record is first created; conditional writes preserve it on subsequent runs.
    """
    today = datetime.now()
    orders = []
    for order_id, product, status, eligible, days in (
        ('ORD-12142', PRODUCTS[0], 'return_requested', 'false', 10),
        ('ORD-59651', PRODUCTS[6], 'delivered', 'true', 7),
    ):
        ordered = today - timedelta(days=days)
        orders.append({
            'customer_id': 'CUST-001', 'order_id': order_id,
            'product_name': product[0], 'product_category': product[2],
            'price': str(product[1]), 'quantity': '1', 'status': status,
            'order_date': ordered.strftime('%Y-%m-%d'),
            'estimated_delivery': (ordered + timedelta(days=5)).strftime('%Y-%m-%d'),
            'return_eligible': eligible,
        })
    return orders

# ─────────────────────────────────────────────
# POLICY DOCUMENTS FOR RAG
# ─────────────────────────────────────────────
# customer_tiers.txt is relevant to all three Knowledge Bases (return windows,
# expedited shipping, warranty lengths), so we store it once and upload it to
# all three KB subdirectories below.
_CUSTOMER_TIERS_CONTENT = """
NovaMart Customer Tier Program
================================
Last Updated: January 2025

TIER OVERVIEW
NovaMart offers two customer tiers: Standard and Premium.

STANDARD TIER
- Default tier for all new customers
- 30-day return window
- Standard shipping rates apply
- 1-year warranty on electronics
- Standard customer support response time: 24-48 hours

PREMIUM TIER
Requirements: Spend $500+ in a calendar year OR place 20+ orders in a calendar year.
Benefits:
- Extended 60-day return window
- Free expedited shipping on all orders
- 3-year warranty on electronics
- Priority customer support: response within 4 hours
- Early access to sales and new product launches
- Dedicated account manager for orders over $500

HOW TO UPGRADE
Customers are automatically upgraded to Premium when they meet the spending
or order threshold. An email notification is sent upon upgrade.
Tier status is evaluated on a rolling 12-month basis.

TIER DOWNGRADE
If a customer falls below the Premium threshold for 12 consecutive months,
they will be moved back to Standard tier with 30 days notice.
"""

# Keys are relative S3 paths appended to "policies/" by upload_policy_documents().
# Each Bedrock Knowledge Base is configured to sync a specific prefix:
#   Returns KB  → policies/returns/
#   Shipping KB → policies/shipping/
#   Warranty KB → policies/warranty/
POLICY_DOCUMENTS = {
    "returns/return_policy.txt": """
NovaMart Return Policy
=======================
Last Updated: January 2025

STANDARD RETURN WINDOW
Customers may return most items within 30 days of delivery for a full refund.
Premium tier customers receive an extended 60-day return window.

ELIGIBLE ITEMS
- Electronics: Must be in original packaging with all accessories included.
- Clothing and Footwear: Must be unworn, unwashed, with original tags attached.
- Appliances: Must be unused and in original packaging.
- Books and Media: Eligible for return only if defective.

INELIGIBLE ITEMS
- Perishable goods (food, flowers, plants)
- Personalized or custom-made items
- Digital downloads and software licenses
- Items marked as "Final Sale"
- Hazardous materials

RETURN PROCESS
1. Log in to your account and navigate to Order History.
2. Select the item you wish to return and click "Start Return."
3. Choose your reason for return from the dropdown menu.
4. Print the prepaid return shipping label.
5. Pack the item securely and drop it off at any authorized carrier location.
6. Refunds are processed within 5-7 business days of receiving the return.

REFUND METHODS
- Original payment method (credit/debit card): 5-7 business days
- Store credit: Immediate upon return approval
- Gift returns: Store credit only

DAMAGED OR DEFECTIVE ITEMS
If you receive a damaged or defective item, contact customer support within 48 hours
of delivery. We will arrange a free return and send a replacement at no additional cost.

EXCHANGES
Direct exchanges are available for clothing and footwear. All other exchanges
must be processed as a return followed by a new purchase.

CONTACT
For return assistance: support@novamart.example.com | 1-800-NOVA-456
""",

    "shipping/shipping_policy.txt": """
NovaMart Shipping Policy
=========================
Last Updated: January 2025

DOMESTIC SHIPPING OPTIONS
Standard Shipping (5-7 business days): Free on orders over $50, $4.99 otherwise
Expedited Shipping (2-3 business days): $9.99
Overnight Shipping (next business day): $24.99
Same-Day Delivery (select metros): $14.99

INTERNATIONAL SHIPPING
We ship to over 50 countries. International shipping rates and delivery times vary
by destination. Import duties and taxes are the responsibility of the recipient.
Estimated delivery: 7-21 business days depending on destination.

ORDER PROCESSING
Orders placed before 2:00 PM EST on business days are processed same day.
Orders placed after 2:00 PM EST or on weekends are processed the next business day.
Orders are not processed on federal holidays.

TRACKING
A tracking number is emailed within 24 hours of shipment.
Track your order at novamart.example.com/track or via the carrier's website.

DELIVERY ISSUES
Lost packages: File a claim within 30 days of expected delivery date.
Wrong address: Contact support immediately. Address changes after dispatch may incur fees.
Missed delivery: The carrier will attempt delivery up to 3 times before holding at facility.

PREMIUM MEMBER BENEFITS
Premium tier customers receive free expedited shipping on all orders.
""",

    "warranty/warranty_policy.txt": """
NovaMart Warranty Policy
==========================
Last Updated: January 2025

STANDARD WARRANTY
All NovaMart products come with a 1-year limited warranty against manufacturing defects.
Electronics carry a 2-year warranty. 

WARRANTY COVERAGE
The warranty covers:
- Manufacturing defects
- Hardware failures under normal use
- Defective materials

The warranty does NOT cover:
- Damage from accidents, misuse, or negligence
- Normal wear and tear
- Water damage (unless product is rated waterproof)
- Unauthorized modifications or repairs
- Cosmetic damage (scratches, dents)

WARRANTY CLAIMS
To file a warranty claim:
1. Contact support with proof of purchase and description of the defect.
2. Our team will assess the claim within 2 business days.
3. If approved, we will repair, replace, or refund at our discretion.

EXTENDED WARRANTY
NovaMart Protection Plans are available for 2 or 3 years of additional coverage.
Plans cover accidental damage in addition to manufacturing defects.
Purchase within 30 days of product purchase for eligibility.

PREMIUM CUSTOMER WARRANTY
Premium tier customers receive an automatic 3-year warranty on all Electronics.
""",

    # customer_tiers uploaded to all three KB prefixes so each retriever agent
    # can apply tier-specific rules (return windows, shipping perks, warranty).
    "returns/customer_tiers.txt":  _CUSTOMER_TIERS_CONTENT,
    "shipping/customer_tiers.txt": _CUSTOMER_TIERS_CONTENT,
    "warranty/customer_tiers.txt": _CUSTOMER_TIERS_CONTENT,
}


def seed_customers():
    table = dynamodb.Table(f"{PROJECT_NAME}-customers")
    print("Seeding customers table...")
    inserted = sum(insert_if_missing(table, customer) for customer in CUSTOMERS)
    print(f"  ✓ Inserted {inserted} customers; preserved {len(CUSTOMERS) - inserted}")


def seed_orders():
    table = dynamodb.Table(f"{PROJECT_NAME}-orders")
    print("Seeding orders table...")
    orders = generate_orders()
    inserted = sum(insert_if_missing(table, order) for order in orders)
    print(f"  ✓ Inserted {inserted} orders; preserved {len(orders) - inserted}")


def upload_policy_documents():
    print("Uploading policy documents to S3...")
    for filename, content in POLICY_DOCUMENTS.items():
        s3.put_object(
            Bucket=POLICY_BUCKET,
            Key=f"policies/{filename}",
            Body=content.encode('utf-8'),
            ContentType='text/plain',
            Metadata={
                'document_type': 'policy',
                'last_updated': '2025-01'
            }
        )
        print(f"  ✓ Uploaded {filename}")


def create_test_user():
    """Create a test Cognito user for student testing."""
    cognito = boto3.client('cognito-idp', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
    
    # Get User Pool ID from CloudFormation exports
    cf = boto3.client('cloudformation', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
    try:
        response = cf.list_exports()
        exports = {e['Name']: e['Value'] for e in response['Exports']}
        user_pool_id = exports.get(f'{PROJECT_NAME}-UserPoolId')
        
        if user_pool_id:
            cognito.admin_create_user(
                UserPoolId=user_pool_id,
                Username='testuser@udacity.com',
                TemporaryPassword='TempPass123!',
                UserAttributes=[
                    {'Name': 'email', 'Value': 'testuser@udacity.com'},
                    {'Name': 'email_verified', 'Value': 'true'},
                    {'Name': 'name', 'Value': 'Udacity Test User'},
                ],
                MessageAction='SUPPRESS'
            )
            print("  ✓ Created test user: testuser@udacity.com / TempPass123!")
        else:
            print("  ⚠ Could not find UserPoolId - skipping test user creation")
    except Exception as e:
        print(f"  ⚠ Test user creation skipped: {e}")


if __name__ == '__main__':
    print("=" * 50)
    print("Udacity AgentCore Project - Data Seeding")
    print("=" * 50)
    
    initialize_clients()
    seed_customers()
    seed_orders()
    upload_policy_documents()
    
    print("\n✅ Workspace seeding complete!")
    print("\nExported resource names:")
    print(f"  Orders Table:    {PROJECT_NAME}-orders")
    print(f"  Customers Table: {PROJECT_NAME}-customers")
    print(f"  Policy Bucket:   {POLICY_BUCKET}")
