export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? ' brand--compact' : ''}`}>
      <span className="brand__mark" aria-hidden="true">A</span>
      <span className="brand__copy">
        <strong>Agatha</strong>
        <small>ERP · Nobug Labs</small>
      </span>
    </div>
  );
}
