import type { GpuInfo, HardwareProfile } from '../../types/api';
import { formatBytes, probed, type Known } from '../../utils/format';
import { Badge, Card, Dot, Field } from '../common/ui';

function show<T>(k: Known<T>, f: (v: T) => React.ReactNode = (v) => String(v)) {
  return k.known ? f(k.value) : null;
}
function why<T>(k: Known<T>): string | undefined {
  return k.known ? undefined : k.reason;
}

export function CpuCard({ hw }: { hw: HardwareProfile }) {
  const cpu = hw.cpu;
  const model = probed(cpu?.model);
  const phys = probed(cpu?.physical_cores);
  const logical = probed(cpu?.logical_cores);
  const tiers = probed(cpu?.tiers);
  const numa = probed(cpu?.numa_nodes);
  return (
    <Card title="CPU">
      <dl className="divide-y divide-border/60">
        <Field label="Model" value={show(model)} why={why(model)} />
        <Field label="Architecture" value={cpu?.arch ?? null} mono />
        <Field label="Cores" value={phys.known ? `${phys.value} physical${logical.known ? ` · ${logical.value} logical` : ''}` : null} why={why(phys)} mono />
        <Field
          label="Core tiers"
          value={show(tiers, (t) => (t.length ? t.map((x) => `${x.physical} ${x.name.toLowerCase()}`).join(' · ') : 'uniform'))}
          why={why(tiers)}
        />
        <Field label="NUMA nodes" value={show(numa)} why={why(numa)} mono />
        <Field label="SIMD" value={cpu?.simd?.length ? cpu.simd.join(', ') : null} why="not reported" mono />
      </dl>
    </Card>
  );
}

export function MemoryCard({ hw }: { hw: HardwareProfile }) {
  const total = probed(hw.memory?.total);
  const avail = probed(hw.memory?.available);
  const cg = probed(hw.memory?.cgroup_limit);
  return (
    <Card title="Memory">
      <dl className="divide-y divide-border/60">
        <Field label="System RAM" value={show(total, formatBytes)} why={why(total)} mono />
        <Field label="Available" value={show(avail, formatBytes)} why={why(avail) ?? 'not reported by this server'} mono />
        <Field label="Container limit" value={show(cg, (c) => (c === 'none' ? 'none' : formatBytes(c.limited)))} why={why(cg)} mono />
      </dl>
    </Card>
  );
}

function GpuRow({ g }: { g: GpuInfo }) {
  const st = g.status;
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px]">{g.backend}</span>
        {st.status === 'available' ? (
          <Badge tone="ok">
            <Dot tone="ok" /> available
          </Badge>
        ) : (
          <Badge tone="muted">unavailable</Badge>
        )}
      </div>
      {st.status === 'unavailable' ? (
        <p className="mt-1 text-[12px] text-muted">{st.reason}</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {st.devices.length === 0 && <li className="text-[12px] text-muted">No devices reported</li>}
          {st.devices.map((d) => {
            const mem = probed(d.memory);
            const cu = probed(d.compute_units);
            const drv = probed(d.driver);
            return (
              <li key={d.ordinal} className="text-[12px]">
                <div className="text-text">
                  #{d.ordinal} {d.name}
                  {d.unified_memory ? <span className="text-muted"> · unified memory</span> : null}
                </div>
                <div className="font-mono text-muted" title={[why(mem), why(cu), why(drv)].filter(Boolean).join('; ')}>
                  memory {mem.known ? formatBytes(mem.value) : '—'} · compute units {cu.known ? cu.value : '—'} · driver {drv.known ? drv.value : '—'}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function GpuCard({ hw }: { hw: HardwareProfile }) {
  const gpus = hw.gpus ?? [];
  return (
    <Card title="Accelerators">
      {gpus.length === 0 ? <p className="text-[13px] text-muted">No GPU backends reported.</p> : <div className="divide-y divide-border/60">{gpus.map((g) => <GpuRow key={g.backend} g={g} />)}</div>}
    </Card>
  );
}

export function StorageCard({ hw }: { hw: HardwareProfile }) {
  const st = probed(hw.storage);
  return (
    <Card title="Storage">
      {!st.known ? (
        <p className="text-[13px] text-muted">Not reported: {st.reason}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[12px] text-muted">
              <tr>
                <th className="py-1 pr-3 font-normal">Mount</th>
                <th className="py-1 pr-3 font-normal">Kind</th>
                <th className="py-1 pr-3 text-right font-normal">Available</th>
                <th className="py-1 text-right font-normal">Capacity</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular">
              {st.value.map((s) => {
                const kind = probed(s.kind);
                const a = probed(s.available);
                const c = probed(s.capacity);
                return (
                  <tr key={s.mount_point} className="border-t border-border/60">
                    <td className="max-w-[220px] truncate py-1.5 pr-3" title={s.mount_point}>
                      {s.mount_point}
                    </td>
                    <td className="py-1.5 pr-3 text-muted">
                      {kind.known ? kind.value : '—'}
                      {s.filesystem ? ` · ${s.filesystem}` : ''}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{a.known ? formatBytes(a.value) : '—'}</td>
                    <td className="py-1.5 text-right">{c.known ? formatBytes(c.value) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function OsCard({ hw }: { hw: HardwareProfile }) {
  const name = probed(hw.os?.name);
  const kernel = probed(hw.os?.kernel);
  return (
    <Card title="Operating system">
      <dl className="divide-y divide-border/60">
        <Field label="Name" value={show(name)} why={why(name)} />
        <Field label="Family" value={hw.os?.family ?? null} mono />
        <Field label="Kernel" value={show(kernel)} why={why(kernel)} mono />
      </dl>
    </Card>
  );
}
