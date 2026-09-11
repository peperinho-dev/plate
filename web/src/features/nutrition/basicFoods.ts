// Alimentos básicos: the generic-food tier Open Food Facts doesn't have.
//
// OFF is a barcode database. It knows every brand of oat drink in Spain
// and does not know what a banana is — "plátano" returns six entries and
// every one of them has an empty `nutriments`, so the search filters them
// all out and shows nothing. The same hole swallows rice, eggs, chicken
// breast, olive oil: exactly the foods you eat most and would most like
// to log in one tap.
//
// MacroFactor closes it with ~26,500 "common foods" sourced from research
// databases rather than barcodes, and ranks them *above* branded results
// because branded items are usually reached by scanning. This is the same
// idea at the scale one person actually needs: a couple of hundred Spanish
// staples, in the bundle, instant and offline.
//
// Values are per 100 g (edible portion, raw unless the name says
// otherwise), sodium in mg, from BEDCA and USDA FoodData Central. They are
// reference figures for a generic food, not a specific product — anything
// with a barcode should still be scanned.
import { foldText, wordMatchRank } from "../../shared/lib/text";
import { searchFoods, type SearchHit } from "../../shared/lib/foodLookup";

export interface BasicFood {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sugar: number;
  /** mg per 100 g, matching how the app stores sodium everywhere else. */
  sodium: number;
  /** A natural serving, where one exists — "2 huevos" beats "110 g". */
  unitName?: string;
  gramsPerUnit?: number;
}

// [name, kcal, protein, fat, carbs, fiber, sugar, sodium, unitName?, gramsPerUnit?]
type Row = [string, number, number, number, number, number, number, number, string?, number?];

const ROWS: Row[] = [
  // — Cereales, pan y pasta —
  ["Arroz blanco crudo", 350, 7.1, 0.6, 78, 1.3, 0.1, 5],
  ["Arroz blanco cocido", 130, 2.4, 0.3, 28, 0.4, 0.1, 1],
  ["Arroz integral cocido", 123, 2.6, 1, 25.6, 1.6, 0.2, 4],
  ["Pasta cruda", 371, 13, 1.5, 74.7, 3.2, 2.7, 6],
  ["Pasta cocida", 158, 5.8, 0.9, 30.9, 1.8, 0.6, 1],
  ["Pasta integral cocida", 124, 5.3, 0.5, 26.5, 3.9, 0.6, 3],
  ["Pan blanco", 265, 9, 3.2, 49, 2.7, 5, 490, "rebanada", 30],
  ["Pan integral", 247, 13, 3.4, 41, 7, 6, 450, "rebanada", 35],
  ["Pan de molde", 265, 8.5, 4, 45, 3, 5, 480, "rebanada", 28],
  ["Avena en copos", 389, 16.9, 6.9, 66.3, 10.6, 0, 2],
  ["Harina de avena", 375, 13.2, 6.5, 62, 8, 1, 5],
  ["Harina de trigo", 364, 10.3, 1, 76.3, 2.7, 0.3, 2],
  ["Cuscús cocido", 112, 3.8, 0.2, 23.2, 1.4, 0.1, 5],
  ["Quinoa cocida", 120, 4.4, 1.9, 21.3, 2.8, 0.9, 7],
  ["Tortilla de trigo", 310, 8, 8, 50, 2.5, 2, 600, "tortilla", 45],
  ["Pan rallado", 370, 12, 4, 70, 4, 3, 700],
  ["Cereales de maíz", 357, 7, 0.9, 84, 3, 8, 650],
  ["Muesli", 360, 10, 6, 60, 8, 15, 25],
  ["Picos de pan", 400, 11, 8, 70, 3, 2, 900],

  // — Legumbres y vegetales proteicos —
  ["Lentejas cocidas", 116, 9, 0.4, 20, 7.9, 1.8, 2],
  ["Garbanzos cocidos", 164, 8.9, 2.6, 27.4, 7.6, 4.8, 7],
  ["Alubias blancas cocidas", 139, 9.7, 0.5, 25, 6.3, 0.3, 6],
  ["Alubias rojas cocidas", 127, 8.7, 0.5, 22.8, 6.4, 0.3, 2],
  ["Guisantes cocidos", 84, 5.4, 0.2, 15.6, 5.5, 5.7, 3],
  ["Soja texturizada", 330, 50, 2, 30, 18, 8, 5],
  ["Hummus", 166, 7.9, 9.6, 14.3, 6, 0.3, 380],
  ["Tofu", 76, 8, 4.8, 1.9, 0.3, 0.6, 7],
  ["Tempeh", 192, 20, 11, 7.6, 0, 0, 9],

  // — Carnes y huevos —
  ["Pechuga de pollo cruda", 120, 23, 2.6, 0, 0, 0, 60],
  ["Pechuga de pollo a la plancha", 165, 31, 3.6, 0, 0, 0, 74],
  ["Muslo de pollo", 177, 24, 8.5, 0, 0, 0, 86],
  ["Pechuga de pavo", 135, 29, 1.7, 0, 0, 0, 70],
  ["Ternera magra", 158, 26, 5.4, 0, 0, 0, 60],
  ["Solomillo de cerdo", 143, 26, 3.5, 0, 0, 0, 57],
  ["Lomo de cerdo", 165, 27, 6, 0, 0, 0, 60],
  ["Carne picada de ternera 5%", 137, 21, 5, 0, 0, 0, 70],
  ["Cordero", 258, 25, 17, 0, 0, 0, 72],
  ["Jamón serrano", 241, 31, 13, 0.3, 0, 0, 2300],
  ["Jamón cocido", 107, 18, 3, 1.5, 0, 1.5, 1100],
  ["Pavo en fiambre", 104, 17, 2.5, 2, 0, 1.5, 1000],
  ["Chorizo", 455, 24, 38, 2, 0, 1, 1700],
  ["Bacon", 541, 37, 42, 1.4, 0, 0, 1700],
  ["Salchichas", 290, 11, 26, 2.5, 0, 1.5, 900, "salchicha", 40],
  ["Huevo", 143, 12.6, 9.5, 0.7, 0, 0.4, 142, "huevo", 55],
  ["Clara de huevo", 52, 10.9, 0.2, 0.7, 0, 0.7, 166, "clara", 33],
  ["Yema de huevo", 322, 15.9, 26.5, 3.6, 0, 0.6, 48, "yema", 17],

  // — Pescado y marisco —
  ["Merluza", 72, 17, 0.6, 0, 0, 0, 100],
  ["Bacalao", 82, 18, 0.7, 0, 0, 0, 54],
  ["Salmón", 208, 20, 13, 0, 0, 0, 59],
  ["Atún fresco", 130, 23, 4, 0, 0, 0, 45],
  ["Atún en lata al natural", 116, 26, 1, 0, 0, 0, 320, "lata", 52],
  ["Sardinas en lata", 208, 25, 11, 0, 0, 0, 500],
  ["Gambas", 99, 24, 0.3, 0.2, 0, 0, 111],
  ["Mejillones", 86, 12, 2.2, 3.7, 0, 0, 286],
  ["Pulpo", 82, 15, 1, 2.2, 0, 0, 230],
  ["Boquerones", 131, 20, 5, 0, 0, 0, 104],
  ["Lubina", 97, 18, 2.5, 0, 0, 0, 68],
  ["Dorada", 100, 20, 2, 0, 0, 0, 70],
  ["Palitos de cangrejo", 95, 8, 1, 13, 0, 5, 700, "palito", 17],

  // — Lácteos y bebidas vegetales —
  ["Leche entera", 61, 3.2, 3.3, 4.8, 0, 4.8, 43],
  ["Leche semidesnatada", 46, 3.3, 1.6, 4.8, 0, 4.8, 44],
  ["Leche desnatada", 34, 3.4, 0.1, 5, 0, 5, 42],
  ["Bebida de avena", 45, 0.6, 1.3, 7.5, 0.8, 4, 45],
  ["Bebida de almendra", 15, 0.5, 1.2, 0.3, 0.4, 0.2, 60],
  ["Bebida de soja", 33, 3.3, 1.8, 0.6, 0.6, 0.2, 40],
  ["Yogur natural", 61, 3.5, 3.3, 4.7, 0, 4.7, 46, "yogur", 125],
  ["Yogur griego", 97, 9, 5, 3.6, 0, 3.6, 36, "yogur", 125],
  ["Yogur desnatado", 43, 4.4, 0.2, 6, 0, 6, 50, "yogur", 125],
  ["Skyr", 63, 11, 0.2, 4, 0, 4, 50, "tarrina", 150],
  ["Queso fresco batido 0%", 47, 8, 0.2, 3.5, 0, 3.5, 45],
  ["Requesón", 98, 11, 4.3, 3.4, 0, 2.7, 364],
  ["Queso curado", 393, 25, 32, 1.3, 0, 0.5, 700],
  ["Queso semicurado", 360, 25, 28, 1, 0, 0.5, 650],
  ["Queso fresco", 174, 12, 12, 3, 0, 3, 300],
  ["Mozzarella", 280, 22, 22, 2.2, 0, 1, 486],
  ["Queso de untar", 250, 6, 24, 4, 0, 3.5, 600],
  ["Parmesano", 392, 35, 25, 4.1, 0, 0.8, 1600],
  ["Nata para cocinar", 190, 2.5, 18, 3.5, 0, 3.5, 40],
  ["Mantequilla", 717, 0.9, 81, 0.1, 0, 0.1, 11],
  ["Kéfir", 55, 3.3, 3, 4.5, 0, 4.5, 40],

  // — Verduras y hortalizas —
  ["Brócoli", 34, 2.8, 0.4, 7, 2.6, 1.7, 33],
  ["Espinacas", 23, 2.9, 0.4, 3.6, 2.2, 0.4, 79],
  ["Lechuga", 15, 1.4, 0.2, 2.9, 1.3, 0.8, 28],
  ["Tomate", 18, 0.9, 0.2, 3.9, 1.2, 2.6, 5, "tomate", 120],
  ["Cebolla", 40, 1.1, 0.1, 9.3, 1.7, 4.2, 4],
  ["Pimiento rojo", 31, 1, 0.3, 6, 2.1, 4.2, 4],
  ["Pimiento verde", 20, 0.9, 0.2, 4.6, 1.7, 2.4, 3],
  ["Zanahoria", 41, 0.9, 0.2, 9.6, 2.8, 4.7, 69],
  ["Calabacín", 17, 1.2, 0.3, 3.1, 1, 2.5, 8],
  ["Berenjena", 25, 1, 0.2, 5.9, 3, 3.5, 2],
  ["Champiñones", 22, 3.1, 0.3, 3.3, 1, 2, 5],
  ["Judías verdes", 31, 1.8, 0.2, 7, 3.4, 3.3, 6],
  ["Coliflor", 25, 1.9, 0.3, 5, 2, 1.9, 30],
  ["Pepino", 15, 0.7, 0.1, 3.6, 0.5, 1.7, 2],
  ["Espárragos", 20, 2.2, 0.1, 3.9, 2.1, 1.9, 2],
  ["Repollo", 25, 1.3, 0.1, 5.8, 2.5, 3.2, 18],
  ["Puerro", 61, 1.5, 0.3, 14, 1.8, 3.9, 20],
  ["Ajo", 149, 6.4, 0.5, 33, 2.1, 1, 17],
  ["Aguacate", 160, 2, 14.7, 8.5, 6.7, 0.7, 7, "aguacate", 150],
  ["Patata cruda", 77, 2, 0.1, 17, 2.2, 0.8, 6],
  ["Patata cocida", 87, 1.9, 0.1, 20, 1.8, 0.9, 4],
  ["Boniato", 86, 1.6, 0.1, 20, 3, 4.2, 55],
  ["Maíz dulce", 86, 3.3, 1.4, 19, 2.7, 3.2, 15],
  ["Calabaza", 26, 1, 0.1, 6.5, 0.5, 2.8, 1],
  ["Alcachofa", 47, 3.3, 0.2, 10.5, 5.4, 1, 94],
  ["Remolacha", 43, 1.6, 0.2, 10, 2.8, 6.8, 78],
  ["Guacamole", 150, 2, 13, 8, 5, 1, 300],

  // — Frutas —
  ["Plátano", 89, 1.1, 0.3, 22.8, 2.6, 12.2, 1, "plátano", 120],
  ["Manzana", 52, 0.3, 0.2, 13.8, 2.4, 10.4, 1, "manzana", 180],
  ["Naranja", 47, 0.9, 0.1, 11.8, 2.4, 9.4, 0, "naranja", 150],
  ["Fresas", 32, 0.7, 0.3, 7.7, 2, 4.9, 1],
  ["Uvas", 69, 0.7, 0.2, 18, 0.9, 15.5, 2],
  ["Sandía", 30, 0.6, 0.2, 7.6, 0.4, 6.2, 1],
  ["Melón", 34, 0.8, 0.2, 8.2, 0.9, 7.9, 16],
  ["Pera", 57, 0.4, 0.1, 15, 3.1, 9.8, 1, "pera", 170],
  ["Kiwi", 61, 1.1, 0.5, 14.7, 3, 9, 3, "kiwi", 75],
  ["Mandarina", 53, 0.8, 0.3, 13.3, 1.8, 10.6, 2, "mandarina", 90],
  ["Piña", 50, 0.5, 0.1, 13.1, 1.4, 9.9, 1],
  ["Melocotón", 39, 0.9, 0.3, 9.5, 1.5, 8.4, 0, "melocotón", 150],
  ["Arándanos", 57, 0.7, 0.3, 14.5, 2.4, 10, 1],
  ["Frambuesas", 52, 1.2, 0.7, 11.9, 6.5, 4.4, 1],
  ["Cerezas", 63, 1.1, 0.2, 16, 2.1, 12.8, 0],
  ["Mango", 60, 0.8, 0.4, 15, 1.6, 13.7, 1],
  ["Ciruela", 46, 0.7, 0.3, 11.4, 1.4, 9.9, 0],
  ["Limón", 29, 1.1, 0.3, 9.3, 2.8, 2.5, 2],
  ["Higos", 74, 0.8, 0.3, 19, 2.9, 16, 1],
  ["Dátiles", 282, 2.5, 0.4, 75, 8, 63, 2],
  ["Pasas", 299, 3.1, 0.5, 79, 3.7, 59, 11],
  ["Granada", 83, 1.7, 1.2, 18.7, 4, 13.7, 3],

  // — Frutos secos y grasas —
  ["Almendras", 579, 21, 50, 22, 12.5, 4.4, 1],
  ["Nueces", 654, 15, 65, 14, 6.7, 2.6, 2],
  ["Cacahuetes", 567, 26, 49, 16, 8.5, 4.7, 18],
  ["Anacardos", 553, 18, 44, 30, 3.3, 6, 12],
  ["Pistachos", 560, 20, 45, 28, 10, 8, 1],
  ["Avellanas", 628, 15, 61, 17, 10, 4.3, 0],
  ["Semillas de chía", 486, 17, 31, 42, 34, 0, 16],
  ["Semillas de girasol", 584, 21, 51, 20, 9, 2.6, 9],
  ["Crema de cacahuete", 588, 25, 50, 20, 6, 9, 17],
  ["Aceite de oliva", 884, 0, 100, 0, 0, 0, 2, "cucharada", 10],
  ["Aceite de girasol", 884, 0, 100, 0, 0, 0, 0, "cucharada", 10],
  ["Aceitunas", 145, 1, 15, 3.8, 3.3, 0.5, 1550],
  ["Coco rallado", 660, 6.9, 64.5, 23, 16, 7, 37],

  // — Azúcares, dulces y snacks —
  ["Azúcar blanco", 400, 0, 0, 100, 0, 100, 1, "cucharadita", 5],
  ["Azúcar moreno", 380, 0, 0, 98, 0, 97, 28, "cucharadita", 5],
  ["Miel", 304, 0.3, 0, 82, 0.2, 82, 4, "cucharada", 21],
  ["Mermelada", 278, 0.4, 0.1, 69, 1, 60, 32],
  ["Chocolate negro 70%", 546, 7.8, 31, 61, 7, 48, 24, "onza", 10],
  ["Chocolate con leche", 535, 7.6, 30, 59, 3.4, 52, 79, "onza", 10],
  ["Cacao en polvo desgrasado", 355, 20.5, 10.9, 17.7, 31.5, 1.2, 20],
  ["Crema de cacao y avellanas", 539, 6, 31, 57, 5, 56, 41],
  ["Galletas María", 430, 7, 10, 76, 2.5, 22, 500, "galleta", 7],
  ["Helado de vainilla", 207, 3.5, 11, 23.6, 0.7, 21, 80],
  ["Patatas fritas de bolsa", 536, 7, 35, 53, 4.4, 0.3, 525],
  ["Palomitas", 387, 12, 4.5, 78, 15, 0.9, 8],
  ["Donut", 452, 5, 25, 51, 1.5, 23, 326, "donut", 60],
  ["Croissant", 406, 8.2, 21, 45.8, 2.6, 11, 492, "croissant", 60],
  ["Magdalena", 420, 6, 20, 54, 1.5, 28, 300, "magdalena", 40],
  ["Tarta de queso", 321, 5.5, 22, 25, 0.4, 20, 438],
  ["Churros", 350, 5, 20, 38, 1.5, 1, 300],
  ["Turrón", 500, 10, 28, 50, 2, 45, 50],
  ["Gominolas", 340, 6.5, 0, 78, 0, 60, 40],

  // — Salsas y condimentos —
  ["Mayonesa", 680, 1, 75, 1.3, 0, 1, 635, "cucharada", 15],
  ["Kétchup", 101, 1.2, 0.1, 24, 0.3, 21, 900, "cucharada", 15],
  ["Mostaza", 66, 4, 3.3, 5, 3, 1, 1100, "cucharada", 15],
  ["Salsa de soja", 53, 8, 0.1, 4.9, 0.8, 1.7, 5500, "cucharada", 15],
  ["Tomate frito", 82, 1.3, 4, 10, 1.5, 7, 430],
  ["Tomate triturado", 32, 1.4, 0.3, 5.5, 1.3, 4.5, 10],
  ["Sofrito", 100, 1.3, 6, 9, 1.5, 6, 400],
  ["Caldo de pollo", 6, 0.9, 0.2, 0.3, 0, 0.2, 350],

  // — Bebidas —
  ["Zumo de naranja", 45, 0.7, 0.2, 10.4, 0.2, 8.4, 1, "vaso", 200],
  ["Refresco de cola", 42, 0, 0, 10.6, 0, 10.6, 5, "lata", 330],
  ["Refresco zero", 0.3, 0, 0, 0, 0, 0, 10, "lata", 330],
  ["Cerveza", 43, 0.5, 0, 3.6, 0, 0, 4, "tercio", 330],
  ["Vino tinto", 85, 0.1, 0, 2.6, 0, 0.6, 4, "copa", 150],
  ["Bebida isotónica", 24, 0, 0, 6, 0, 5, 40, "botella", 500],
  ["Proteína en polvo", 380, 78, 4, 8, 2, 3, 300, "cacito", 30],

  // — Platos preparados —
  ["Pizza margarita", 266, 11, 10, 33, 2.3, 3.6, 598],
  ["Paella", 160, 8, 4, 22, 1, 1, 450],
  ["Tortilla de patatas", 210, 6, 14, 15, 1.2, 1, 400],
  ["Empanadilla", 280, 8, 16, 26, 1.5, 2, 500, "empanadilla", 50],
  ["Lasaña", 135, 8, 6, 12, 1, 2, 350],
  ["Hamburguesa de ternera", 250, 17, 17, 5, 0, 1, 400, "hamburguesa", 120],
  ["Sushi", 145, 6, 2, 25, 0.8, 3, 300],
  ["Ensaladilla rusa", 180, 3, 13, 12, 1.5, 2, 450],
  ["Croquetas", 250, 7, 14, 23, 1, 2, 500, "croqueta", 30],
  ["Gazpacho", 40, 0.8, 2.5, 3.5, 0.8, 2.5, 300, "vaso", 200]
];

export const BASIC_FOODS: BasicFood[] = ROWS.map(
  ([name, kcal, protein, fat, carbs, fiber, sugar, sodium, unitName, gramsPerUnit]) => ({
    id: `basic:${foldText(name).replace(/\s+/g, "-")}`,
    name,
    kcal,
    protein,
    fat,
    carbs,
    fiber,
    sugar,
    sodium,
    unitName,
    gramsPerUnit
  })
);

// Whole-name prefix, then word-start, then mid-word, and shortest name
// inside each band — so "pollo" leads with "Muslo de pollo" instead of
// "Repollo", which is shorter and contains the letters by accident.
export function searchBasicFoods(query: string, limit = 6): BasicFood[] {
  const q = foldText(query);
  if (!q) return [];
  return BASIC_FOODS.map((f) => ({ f, rank: wordMatchRank(f.name, q) }))
    .filter((r): r is { f: BasicFood; rank: number } => r.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.f.name.length - b.f.name.length)
    .slice(0, limit)
    .map((r) => r.f);
}

// Adapted to the same shape a database result uses, so the plate, the
// quantity editor and the unit handling all work on it unchanged.
export function basicToSearchHit(f: BasicFood): SearchHit {
  return {
    id: f.id,
    name: f.name,
    kcalPer100: f.kcal,
    proteinPer100: f.protein,
    fatPer100: f.fat,
    carbsPer100: f.carbs,
    fiberPer100: f.fiber,
    sugarPer100: f.sugar,
    sodiumPer100: f.sodium,
    unitName: f.unitName,
    gramsPerUnit: f.gramsPerUnit
  };
}

// For the two search boxes that show one flat list rather than sections
// (the entry form and the recipe editor). Same ordering rule as the main
// logger — basics ahead of branded products — expressed as a merge
// instead of a second section, because those screens have no room for one.
export async function searchFoodsWithBasics(query: string, limit = 12): Promise<SearchHit[]> {
  const basics = searchBasicFoods(query, 4).map(basicToSearchHit);
  const taken = new Set(basics.map((b) => foldText(b.name)));
  const remote = await searchFoods(query, limit);
  return [...basics, ...remote.filter((r) => !taken.has(foldText(r.name)))].slice(0, limit);
}
