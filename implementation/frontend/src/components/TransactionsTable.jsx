export default function TransactionsTable({ transactions }) {
  if (!transactions || transactions.length === 0) return null;

  const formatValue = (key, val) => {
    if (val === null || val === undefined) return '—';
    if (key === 'amount') {
      const num = parseFloat(val);
      if (!isNaN(num)) return num > 0 ? `+${num.toFixed(2)}` : num.toFixed(2);
    }
    return val;
  };

  return (
    <div className="transactions-section">
      <div className="transactions-header">
        <h2>Transactions</h2>
        <p>
          <span className="positive">+ amounts</span> added to customer (you!) ·{' '}
          <span className="negative">− amounts</span> deducted from customer (you!)
        </p>
      </div>
      <div className="transactions-table-wrapper">
        <table className="transactions-table">
          <thead>
            <tr>
              {Object.keys(transactions[0]).map((key) => (
                <th key={key}>{key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, i) => (
              <tr key={i}>
                {Object.entries(tx).map(([key, val], j) => {
                  const formatted = formatValue(key, val);
                  const cls = key === 'amount' && !isNaN(parseFloat(val))
                    ? parseFloat(val) > 0 ? 'positive' : 'negative'
                    : undefined;
                  return <td key={j} className={cls}>{formatted}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
