import { Unavailable } from '../components/common/Unavailable';

/** Pages scheduled for later phases (docs/05). They show nothing rather than sample data. */
export function ModelsPage() {
  return (
    <div className="mx-auto max-w-[1280px] p-4 lg:p-6">
      <Unavailable title="Model management is not built yet">
        Loading, unloading and the installed-model inventory arrive in Phase 3. The models loaded now are listed on the System page.
      </Unavailable>
    </div>
  );
}
