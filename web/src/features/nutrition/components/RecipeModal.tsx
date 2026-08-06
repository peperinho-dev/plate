// Recipe builder: a name plus a list of ingredients, each carrying a
// per-100g basis so its grams can be re-scaled independently.
import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import { showToast } from "../../../shared/components/Toast";
import { XIcon } from "../../../shared/components/Icons";
import type { FoodItemBasis, Recipe } from "../../../shared/store/types";
import { scaleFoodItem, sumFoodItems } from "../../../shared/lib/foodItems";
import { searchFoods, type SearchHit } from "../../../shared/lib/foodLookup";
import { saveRecipe } from "../recipeActions";

interface RecipeModalProps {
  open: boolean;
  /** Existing recipe when editing, null when creating. */
  recipe: Recipe | null;
  onClose: () => void;
}

export function RecipeModal({ open, recipe, onClose }: RecipeModalProps) {
  const [name, setName] = useState("");
  const [items, setItems] = useState<FoodItemBasis[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(recipe?.name ?? "");
      setItems(recipe ? recipe.items.map((i) => ({ ...i })) : []);
      setQuery("");
      setResults([]);
    }
  }

  const runSearch = async () => {
    const term = query.trim();
    if (!term) return;
    setSearching(true);
    try {
      setResults(await searchFoods(term, 8));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addIngredient = (hit: SearchHit) => {
    setItems((prev) => [
      ...prev,
      {
        name: hit.name,
        grams: 100,
        kcalPer100: hit.kcalPer100 ?? 0,
        proteinPer100: hit.proteinPer100 ?? 0,
        fatPer100: hit.fatPer100 ?? 0,
        carbsPer100: hit.carbsPer100 ?? 0
      }
    ]);
    setResults([]);
    setQuery("");
  };

  const setGrams = (index: number, grams: number) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, grams } : it)));

  const totals = sumFoodItems(items);

  return (
    <Modal open={open} title={recipe ? "Editar receta" : "Nueva receta"} onClose={onClose}>
      <div className="form">
        <label className="field">
          <span>Nombre</span>
          <input
            type="text"
            placeholder="p. ej. Tortilla de patata"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      <span className="field-group-label">Ingredientes</span>
      {items.length === 0 && <p className="empty-state">Sin ingredientes todavía.</p>}
      {items.length > 0 && (
        <div className="log-list">
          {items.map((it, i) => (
            <div className="row" key={`${it.name}-${i}`}>
              <div className="row-main">
                <span className="row-name">{it.name}</span>
                <span className="row-qty">{Math.round(scaleFoodItem(it).calories)} kcal</span>
              </div>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                aria-label={`Gramos de ${it.name}`}
                value={it.grams}
                onChange={(e) => setGrams(i, parseFloat(e.target.value) || 0)}
                style={{ width: 74 }}
              />
              <button
                className="row-del"
                aria-label="Quitar"
                onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <XIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <p className="stat-note">
          Total: {Math.round(totals.calories)} kcal · {Math.round(totals.protein)}P ·{" "}
          {Math.round(totals.fat)}F · {Math.round(totals.carbs)}C
        </p>
      )}

      <div className="field-row" style={{ marginTop: 12 }}>
        <label className="field" style={{ flex: 1 }}>
          <span>Añadir ingrediente</span>
          <input
            type="text"
            placeholder="buscar alimento"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
          />
        </label>
      </div>
      {searching && <p className="modal-hint modal-hint--loading">Buscando…</p>}
      {results.length > 0 && (
        <div className="log-list">
          {results.map((hit) => (
            <div className="row" key={hit.id}>
              <button type="button" className="row-main" onClick={() => addIngredient(hit)}>
                <span className="row-name">{hit.name}</span>
                <span className="row-qty">{Math.round(hit.kcalPer100 ?? 0)} kcal / 100 g</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn--primary btn--block"
        style={{ marginTop: 16 }}
        disabled={!name.trim() || items.length === 0}
        onClick={() => {
          saveRecipe(name.trim(), items, recipe?.id);
          showToast(recipe ? "Receta actualizada" : "Receta guardada");
          onClose();
        }}
      >
        Guardar receta
      </button>
    </Modal>
  );
}
