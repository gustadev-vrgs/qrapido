/** Emoji for a menu category, guessed from its name (works for the usual Brazilian lunch menus). */
const RULES: Array<[RegExp, string]> = [
  [/marmit/, "🍱"],
  [/prato|pf\b|almo[cç]o|executiv|refei[cç]|feijoada|comida/, "🍛"],
  [/churras|grelhad|carne|bife|picanha/, "🥩"],
  [/frango|galinha/, "🍗"],
  [/peixe|frutos do mar|camar[aã]o|sushi/, "🐟"],
  [/massa|macarr[aã]o|lasanha|espaguete|nhoque/, "🍝"],
  [/pizza/, "🍕"],
  [/lanche|burger|hamb[uú]rguer|sandu[ií]che|x-/, "🍔"],
  [/salada|vegano|vegetarian|fit/, "🥗"],
  [/por[cç][aã]o|petisco|aperitivo|entrada|frit/, "🍟"],
  [/sopa|caldo/, "🍲"],
  [/sorvete|a[cç]a[ií]|gelad/, "🍨"],
  [/sobremesa|doce|bolo|torta|pudim/, "🍰"],
  [/caf[eé]|ch[aá]\b/, "☕"],
  [/suco|vitamina/, "🧃"],
  [/cerveja|chopp|chope/, "🍺"],
  [/vinho|drink|coquetel|caipirinha|dose/, "🍹"],
  [/[aá]gua/, "💧"],
  [/bebida|refri/, "🥤"]
];

export function categoryIcon(name: string | null | undefined): string {
  const value = (name ?? "").toLowerCase();
  return RULES.find(([pattern]) => pattern.test(value))?.[1] ?? "🍽️";
}
