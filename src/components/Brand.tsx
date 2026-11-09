export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? ' brand--compact' : ''}`}>
      <span className="brand__mark" aria-hidden="true">
        <img src="/brand/agata-mark.png" alt="" />
      </span>
      <span className="brand__copy">
        <strong>Ágata</strong>
        <small>ERP · Nobug Labs</small>
      </span>
    </div>
  );
}
