// An emoji for a food, derived from its name.
//
// The reference app shows one on every food row, which does more than
// decorate: a list of a dozen near-identical grey rows is hard to scan,
// and a picture per row makes the one you're looking for findable by
// shape before you've read anything.
//
// Their database carries a curated icon per food. Ours has only a name —
// typed by the user or returned by Open Food Facts — so the icon is
// matched from the name instead. That means it is sometimes wrong, which
// is why the fallback is a neutral plate rather than a guess.
import { foldText } from "../../shared/lib/text";

// Ordered: the first match wins, so compounds and specifics come before
// the generic word they contain. "Café con leche" must reach café before
// leche, "aceite de oliva" before oliva.
const RULES: [RegExp, string][] = [
  // Drinks — first, because so many contain a food word.
  [/\bcafe|capuchino|cortado|espresso\b/, "☕"],
  [/\bte verde|\bte negro|infusion|manzanilla/, "🍵"],
  [/batido|smoothie|protein|whey/, "🥤"],
  [/zumo|jugo/, "🧃"],
  [/cerveza/, "🍺"],
  [/vino|tinto|blanco de rueda/, "🍷"],
  [/\bagua\b/, "💧"],

  // Prepared dishes.
  [/pizza/, "🍕"],
  [/hamburgues/, "🍔"],
  [/bocadillo|sandwich|sandwiche/, "🥪"],
  [/taco|burrito|fajita/, "🌮"],
  [/sushi|maki|nigiri/, "🍣"],
  [/tortilla|huevo frito|revuelto/, "🍳"],
  [/sopa|crema de|caldo|pure/, "🍲"],
  [/ensalada/, "🥗"],
  [/paella/, "🥘"],

  // Staples.
  [/arroz/, "🍚"],
  [/pasta|espagueti|macarron|fideo|tallarin|lasana/, "🍝"],
  [/avena|cereal|muesli|granola/, "🥣"],
  [/croissant|napolitana/, "🥐"],
  [/tostada|\bpan\b|baguette|integral|centeno/, "🍞"],
  [/patata|papas fritas|\bpapa\b/, "🥔"],
  [/boniato|batata/, "🍠"],
  [/maiz|choclo/, "🌽"],

  // Protein.
  [/bacon|panceta/, "🥓"],
  [/chorizo|salchich|frankfurt/, "🌭"],
  [/jamon|lomo embuchado/, "🍖"],
  [/pollo|pavo|pechuga|muslo/, "🍗"],
  [/ternera|vacuno|\bbuey\b|filete|solomillo|cerdo|carne|cordero/, "🥩"],
  [/salmon|atun|merluza|bacalao|pescado|sardina|trucha|lubina/, "🐟"],
  [/gamba|langostino|marisco|mejillon|calamar|pulpo/, "🦐"],
  [/huevo/, "🥚"],
  [/tofu|seitan|tempeh/, "🍢"],
  [/lenteja|garbanzo|alubia|judia|frijol|legumbre|hummus/, "🫘"],

  // Dairy and fats.
  [/queso|mozzarella|parmesano|cheddar/, "🧀"],
  [/mantequilla|margarina/, "🧈"],
  [/yogur|kefir|cuajada/, "🥛"],
  [/leche|nata/, "🥛"],
  [/aceite|oliva|aceituna/, "🫒"],
  [/aguacate/, "🥑"],

  // Fruit.
  [/platano|banana/, "🍌"],
  [/manzana/, "🍎"],
  [/naranja|mandarina|clementina/, "🍊"],
  [/limon|lima/, "🍋"],
  [/fresa|freson/, "🍓"],
  [/arandano|mora|frambuesa|frutos rojos|bayas/, "🫐"],
  [/\buva\b|uvas/, "🍇"],
  [/sandia/, "🍉"],
  [/melon/, "🍈"],
  [/\bpera\b|peras/, "🍐"],
  [/pina\b|ananas/, "🍍"],
  [/mango/, "🥭"],
  [/kiwi/, "🥝"],
  [/melocoton|durazno|nectarina/, "🍑"],
  [/cereza|picota/, "🍒"],
  [/datil|higo|pasa/, "🍇"],

  // Vegetables.
  [/tomate/, "🍅"],
  [/lechuga|espinaca|rucula|kale|canonigo/, "🥬"],
  [/zanahoria/, "🥕"],
  [/brocoli|coliflor/, "🥦"],
  [/pepino|calabacin/, "🥒"],
  [/pimiento/, "🫑"],
  [/cebolla|puerro/, "🧅"],
  [/\bajo\b/, "🧄"],
  [/champinon|seta|setas/, "🍄"],
  [/berenjena/, "🍆"],
  [/guisante|edamame/, "🫛"],

  // Nuts and sweets.
  [/almendra|nuez|nueces|cacahuete|anacardo|pistacho|frutos secos|avellana/, "🥜"],
  [/chocolate|cacao|onza/, "🍫"],
  [/galleta|cookie/, "🍪"],
  [/tarta|pastel|bizcocho|brownie|magdalena/, "🍰"],
  [/helado|polo/, "🍦"],
  [/miel/, "🍯"],
  [/azucar|caramelo|chuche|gominola/, "🍬"],
  [/donut|rosquilla/, "🍩"],
  [/palomitas/, "🍿"],
  [/patatas fritas|chips|snack/, "🍟"]
];

/** Neutral rather than a guess — a wrong picture is worse than none. */
export const DEFAULT_FOOD_EMOJI = "🍽️";

export function foodEmoji(name: string): string {
  const folded = foldText(name || "");
  for (const [pattern, emoji] of RULES) {
    if (pattern.test(folded)) return emoji;
  }
  return DEFAULT_FOOD_EMOJI;
}
