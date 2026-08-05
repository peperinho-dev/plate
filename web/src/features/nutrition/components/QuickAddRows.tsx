// Favourites / go-tos / recents chips at the top of the entry sheet.
// One tap logs the item directly — the fastest path for the food you eat
// every day, and the main speed win over search-or-scan every time.
import type { QuickItem } from "../quickAdd";

interface QuickAddRowsProps {
  favorites: QuickItem[];
  goTos: QuickItem[];
  recents: QuickItem[];
  onPick: (item: QuickItem) => void;
  onRemoveFavorite: (key: string) => void;
  favoritesEditing: boolean;
  onToggleFavoritesEditing: () => void;
}

function Row({
  label,
  items,
  onPick,
  action,
  onRemove
}: {
  label: string;
  items: QuickItem[];
  onPick: (item: QuickItem) => void;
  action?: React.ReactNode;
  onRemove?: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="quick-section">
      <div className="quick-label-row">
        <div className="quick-label">{label}</div>
        {action}
      </div>
      <div className="quick-row">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className="quick-chip"
            onClick={() => (onRemove ? onRemove(item.key) : onPick(item))}
          >
            <span className="quick-chip-name">{item.name}</span>
            <span className="quick-chip-kcal">{Math.round(item.calories)} kcal</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function QuickAddRows({
  favorites,
  goTos,
  recents,
  onPick,
  onRemoveFavorite,
  favoritesEditing,
  onToggleFavoritesEditing
}: QuickAddRowsProps) {
  return (
    <>
      <Row
        label="★ Favoritos"
        items={favorites}
        onPick={onPick}
        onRemove={favoritesEditing ? onRemoveFavorite : undefined}
        action={
          favorites.length > 0 ? (
            <button type="button" className="link-btn link-btn--muted" onClick={onToggleFavoritesEditing}>
              {favoritesEditing ? "Listo" : "Editar"}
            </button>
          ) : undefined
        }
      />
      <Row label="Habituales a esta hora" items={goTos} onPick={onPick} />
      <Row label="Recientes" items={recents} onPick={onPick} />
    </>
  );
}
