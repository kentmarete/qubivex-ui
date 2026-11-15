import { useRuntime } from '../../hooks/useRuntime';

export function ModelSelect() {
  const rt = useRuntime();
  if (rt.models.length === 0) return null;
  return (
    <label className="flex min-w-0 items-center gap-2 text-[13px]">
      <span className="sr-only">Model</span>
      <select
        value={rt.selectedModel ?? ''}
        onChange={(e) => rt.setSelectedModel(e.target.value)}
        className="h-8 min-w-0 max-w-[220px] truncate rounded-md border border-border bg-surface-2 px-2 font-mono text-[13px]"
      >
        {rt.models.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );
}
