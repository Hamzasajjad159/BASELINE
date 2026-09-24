import type { ConfigCompare as Config } from '../domain/types';

const BADGE: Record<Config['status'], string> = {
  ADDED: 'bg-green-100 text-green-800',
  REMOVED: 'bg-red-100 text-red-800',
  CHANGED: 'bg-amber-100 text-amber-800',
  UNCHANGED: 'bg-slate-100 text-slate-600',
};

interface ConfigCompareProps {
  configs: readonly Config[];
  active: string;
  onSelect: (config: string) => void;
}

export default function ConfigCompare({ configs, active, onSelect }: ConfigCompareProps) {
  return (
    <section
      aria-label="Configurations"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 className="mb-2 font-semibold">Configurations</h2>
      <table className="w-full max-w-2xl text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-1 font-medium">Configuration</th>
            <th className="py-1 text-center font-medium">In A</th>
            <th className="py-1 text-center font-medium">In B</th>
            <th className="py-1 font-medium">Status</th>
            <th className="py-1 text-right font-medium">Changed rows</th>
          </tr>
        </thead>
        <tbody>
          {configs.map((c) => (
            <tr
              key={c.name}
              className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                active === c.name ? 'bg-sky-50' : ''
              }`}
              onClick={() => onSelect(active === c.name ? 'ALL' : c.name)}
            >
              <td className="py-1.5">
                <button type="button" className="text-left font-medium hover:underline">
                  {c.name}
                </button>
              </td>
              <td className="text-center">{c.inA ? '✓' : '—'}</td>
              <td className="text-center">{c.inB ? '✓' : '—'}</td>
              <td>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${BADGE[c.status]}`}>
                  {c.status.toLowerCase()}
                </span>
              </td>
              <td className="text-right tabular-nums">{c.changedRows}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
