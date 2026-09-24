interface DeltaProps {
  before: string | null;
  after: string | null;
}

/** "before → after" with the before value struck through. */
export default function Delta({ before, after }: DeltaProps) {
  return (
    <span className="whitespace-nowrap">
      <s className="text-slate-500 decoration-red-400">{before ?? '∅'}</s>
      <span className="mx-1 text-slate-400">→</span>
      <span className="font-medium">{after ?? '∅'}</span>
    </span>
  );
}
