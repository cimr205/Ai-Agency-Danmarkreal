#!/usr/bin/env bash
# Real concurrency test for 20261112160000_prevent_direct_insert_payment_overpay:
# two genuinely simultaneous psql connections each try to directly INSERT a
# 700 kr payment against the same 1000 kr invoice. At most one may succeed.
# Sequential SQL (as in prevent_direct_insert_payment_overpay.test.sql) cannot
# exercise this — it always serializes through one connection. This script
# opens two real connections and backgrounds them so they race for real.
#
# NOT executed in this session — no reachable database (see
# docs/security/PAYMENT_INTEGRITY_AUDIT.md). Run with:
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
#     ./supabase/tests/runtime_payment_overpay_concurrency.sh
set -euo pipefail
db_url="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

company_id=$(psql "$db_url" -t -A -v ON_ERROR_STOP=1 -c "
  insert into public.companies(id,name) values(gen_random_uuid(),'Concurrency Overpay Co') returning id;")
user_id=$(psql "$db_url" -t -A -v ON_ERROR_STOP=1 -c "
  insert into auth.users(id,email) values(gen_random_uuid(),'overpay-concurrency-'||gen_random_uuid()||'@test.local') returning id;")
psql "$db_url" -v ON_ERROR_STOP=1 -c "update public.profiles set company_id='$company_id' where user_id='$user_id';" >/dev/null
customer_id=$(psql "$db_url" -t -A -v ON_ERROR_STOP=1 -c "
  insert into public.customers(id,company_id,name,email,record_type,status,created_by)
    values(gen_random_uuid(),'$company_id','Concurrency Customer','overpay-concurrency@test.local','customer','customer','$user_id') returning id;")
invoice_id=$(psql "$db_url" -t -A -v ON_ERROR_STOP=1 -c "
  insert into public.invoices(id,company_id,customer_id,invoice_number,amount,status,created_by)
    values(gen_random_uuid(),'$company_id','$customer_id','CONCURRENT-OVERPAY-1',1000,'sent','$user_id') returning id;")

echo "invoice $invoice_id on company $company_id, amount 1000, firing two concurrent 700 payments"

run_payment() {
  local key="$1"
  psql "$db_url" -v ON_ERROR_STOP=1 \
    -c "set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='$user_id';
        insert into public.payments(id,company_id,invoice_id,amount,status,payment_method,created_by,idempotency_key)
          values(gen_random_uuid(),'$company_id','$invoice_id',700,'completed','manual','$user_id','$key');"
}

set +e
run_payment "concurrent-a" > /tmp/overpay_concurrency_a.log 2>&1 &
pid_a=$!
run_payment "concurrent-b" > /tmp/overpay_concurrency_b.log 2>&1 &
pid_b=$!
wait $pid_a; status_a=$?
wait $pid_b; status_b=$?
set -e

accepted=0
[ "$status_a" -eq 0 ] && accepted=$((accepted + 1))
[ "$status_b" -eq 0 ] && accepted=$((accepted + 1))

echo "connection A exit=$status_a, connection B exit=$status_b"
total_paid=$(psql "$db_url" -t -A -v ON_ERROR_STOP=1 -c \
  "select coalesce(sum(amount),0) from public.payments where invoice_id='$invoice_id' and status='completed';")
echo "total recorded against the 1000 kr invoice: $total_paid"

if [ "$accepted" -gt 1 ]; then
  echo "FAIL: both concurrent 700 kr payments were accepted — invoice overpaid ($total_paid vs 1000)"
  cat /tmp/overpay_concurrency_a.log /tmp/overpay_concurrency_b.log
  exit 1
fi
if [ "$total_paid" != "700" ]; then
  echo "FAIL: expected exactly 700 recorded (one accepted payment), got $total_paid"
  exit 1
fi
echo "PASS: at most one of the two concurrent 700 kr payments was accepted, ledger total is $total_paid"
