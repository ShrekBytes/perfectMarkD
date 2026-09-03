# 02 — Admin panel: payments queue + audit log

Status: ready-for-agent
Blocked by: server/01, billing/01

`/admin` shell (admin-gated, same design language, utilitarian). **Payments**: pending queue with full Order details (user, plan, duration, coin/network, txid as explorer deep-link per network, claimed vs expected amount, Reference Code), actions: **Verify** (preset durations or custom expiry; extending an active Entitlement stacks from current expiry) / **Reject** (reason). Decided Orders listed with filters. **Audit log**: every verify/reject/settings change with timestamp + admin + before/after. Reject reasons surface in the user's Upgrade status view.

**Accepts**: verify grants correct Entitlement (incl. stacking math); reject records reason; audit entries written; explorer links correct per network.
