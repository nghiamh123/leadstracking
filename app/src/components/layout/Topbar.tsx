import { List, SignOut } from "@phosphor-icons/react";
import { roleLabels, useSession } from "../../lib/session";

export function Topbar({
  title,
  onMenuClick,
}: {
  title: string;
  onMenuClick: () => void;
}) {
  const { currentUser, logout } = useSession();
  if (!currentUser) return null;

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-1.5 text-ink-soft hover:bg-surface-alt lg:hidden"
          aria-label="Mở menu"
        >
          <List size={20} />
        </button>
        <h1 className="font-serif text-xl text-ink">{title}</h1>
      </div>

      <div className="flex items-center gap-2 border-l border-border pl-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-alt text-xs font-medium text-ink-soft">
          {currentUser.name
            .split(" ")
            .slice(-2)
            .map((s) => s[0])
            .join("")}
        </div>
        <div className="hidden leading-tight sm:block">
          <p className="text-sm text-ink-soft">{currentUser.name}</p>
          <p className="text-[11px] text-muted">{roleLabels[currentUser.role]}</p>
        </div>
        <button
          onClick={() => logout()}
          className="ml-1 rounded-lg p-1.5 text-muted hover:bg-surface-alt hover:text-ink-soft"
          aria-label="Đăng xuất"
        >
          <SignOut size={18} />
        </button>
      </div>
    </header>
  );
}
