export function getTenantId(req) {
  return String(
    req.tenantId ||
    req.tenant_id ||
    req.user?.id_tenant ||
    req.body?.tenant_id ||
    req.query?.tenant_id ||
    '1'
  );
}

export function injectFiscalTenant(req, res, next) {
  const tid = getTenantId(req);
  req.tenant_id = tid;
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body) && !req.body.tenant_id) {
    req.body.tenant_id = tid;
  }
  if (req.query && typeof req.query === 'object' && !req.query.tenant_id) {
    req.query.tenant_id = tid;
  }
  next();
}
