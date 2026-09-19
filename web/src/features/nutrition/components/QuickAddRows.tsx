// Favourites / go-tos / recents chips at the top of the entry sheet.
// One tap logs the item directly — the fastest path for the food you eat
// every day, and the main speed win over search-or-scan every time.
import type { QuickItem } from "../quickAdd";
import { XIcon } from "../../../shared/components/Icons";

interface QuickAddRowsProps {
  favorites: QuickItem[];
  goTos: QuickItem[];
  recents: QuickItem[];
  onPick: (item: QuickItem) => void;
  onRemoveFavorite: (key: string) => void;
  favoritesEditing: boolean;
  onToggleFavoritesEditing: () => void;
  /** Recipes render as their own row with a "+ Nueva" action. */
  recipes: { id: string; name: string; calories: number }[];
  onPickRecipe: (id: string) => void;
  onNewRecipe: () => void;
  onEditRecipe: (id: string) => void;
  onDeleteRecipe: (id: string) => void;
  recipesEditing: boolean;
  onToggleRecipesEditing: () => void;
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
  onToggleFavoritesEditing,
  recipes,
  onPickRecipe,
  onNewRecipe,
  onEditRecipe,
  onDeleteRecipe,
  recipesEditing,
  onToggleRecipesEditing
}: QuickAddRowsProps) {
  return (
    <>
      <div className="quick-section">
        <div className="quick-label-row">
          <div className="quick-label">Recetas</div>
          <div className="quick-label-actions">
            <button type="button" className="link-btn" onClick={onNewRecipe}>
              + Nueva
            </button>
            {recipes.length > 0 && (
              <button type="button" className="link-btn link-btn--muted" onClick={onToggleRecipesEditing}>
                {recipesEditing ? "Listo" : "Editar"}
              </button>
            )}
          </div>
        </div>
        {recipes.length > 0 && (
          <div className="quick-row">
            {recipes.map((r) =>
              recipesEditing ? (
                // Editing needs two actions on one chip — open it, or delete
                // it — so it stops being a single button and becomes two:
                // the name opens RecipeModal, the trailing × removes it.
                // removeRecipe() existed since recipes were built but had
                // no caller anywhere in the app; this is that caller.
                <div className="quick-chip quick-chip--split" key={r.id}>
                  <button type="button" className="quick-chip-main" onClick={() => onEditRecipe(r.id)}>
                    <span className="quick-chip-name">{r.name}</span>
                    <span className="quick-chip-kcal">{Math.round(r.calories)} kcal</span>
                  </button>
                  <button
                    type="button"
                    className="quick-chip-del"
                    aria-label={`Borrar receta ${r.name}`}
                    onClick={() => onDeleteRecipe(r.id)}
                  >
                    <XIcon />
                  </button>
                </div>
              ) : (
                <button
                  key={r.id}
                  type="button"
                  className="quick-chip"
                  onClick={() => onPickRecipe(r.id)}
                >
                  <span className="quick-chip-name">{r.name}</span>
                  <span className="quick-chip-kcal">{Math.round(r.calories)} kcal</span>
                </button>
              )
            )}
          </div>
        )}
      </div>

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
