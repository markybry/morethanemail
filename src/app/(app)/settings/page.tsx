import { requireUser } from "@/lib/session";
import { SettingsForm } from "@/components/SettingsForm";

// Settings: appearance, triage, pinned labels and the account.
export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
        <h1 className="text-xl font-semibold text-walnut">Settings</h1>
        <SettingsForm
          user={{ name: user.name ?? user.email, email: user.email, isDemo: user.isDemo }}
          triageFrom={user.triageFrom?.toISOString() ?? null}
        />
      </div>
    </div>
  );
}
