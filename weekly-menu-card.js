/**
 * weekly-menu-card — Le menu de la semaine, un plat à la fois.
 *
 * Indépendante de toute intégration : elle lit sept entités quelconques
 * via une correspondance d'attributs configurable, et déclenche un service
 * libre pour remplacer un plat. Les valeurs par défaut correspondent à
 * l'intégration ha-jow, mais rien n'y est codé en dur.
 *
 * Le haut de la carte est une vue détail : photo, composition avec
 * quantités, allergènes, lien vers la recette. Cliquer sur un jour de
 * l'index le promeut à cette place.
 *
 * Lit les entités de l'intégration ha-jow (sensor.jow_lundi … dimanche).
 * Codes allergènes : règlement INCO (UE) 1169/2011.
 */

const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const ALLERGENES = {
  1: "gluten", 2: "crustacés", 3: "œufs", 4: "poissons", 5: "arachides",
  6: "soja", 7: "lait", 8: "fruits à coque", 9: "céleri", 10: "moutarde",
  11: "sésame", 12: "sulfites", 13: "lupin", 14: "mollusques",
};

/* Correspondance entre ce dont la carte a besoin et les attributs de vos
   entités. Les valeurs par défaut sont celles de l'intégration ha-jow, mais
   la carte fonctionne avec n'importe quelle entité : capteur modèle, Mealie,
   Tandoor, ou un sensor rempli à la main. */
const CHAMPS = {
  name: null,              // null = on prend l'état de l'entité
  planned: "planned",
  image: "image",
  url: "url",
  date: "date",
  calories: "calories",
  allergens: "allergens",
  allergens_source: "allergens_source",
  covers: "covers",
  duration: "preparation_time",
  cooking_time: "cooking_time",
  ingredients: "ingredients",
};

const DEFAUTS = {
  prefix: "sensor.jow_",
  days: 7,
  show_calories: true,
  show_allergens: true,
  show_week_calories: false,   // Total calories de la semaine en pied de carte
  show_month: false,           // Vue mensuelle compacte (4 semaines)
  replace_action: null,    // { service: "domaine.service", data: { … } }
  // Thèmes par jour : injectés dans le criteria de l'IA
  // ex: { "lundi": "végétarien", "mardi": "poisson", "vendredi": "plaisir" }
  day_themes: {},
  // Ingrédients disponibles (inventaire du frigo) : injectés dans le criteria
  // ex: "poulet, courgettes, tomates"
  fridge_ingredients: "",
  // Boutons d'action prédéfinis (activés par défaut, configurables)
  actions: {
    meal_done: true,        // Marquer le repas comme fait
    clear_meal: true,       // Effacer le repas du jour
    refresh_shopping: false,// Régénérer la liste de courses
    copy_meal: false,       // Copier vers un autre jour (restes)
  },
};

/* Définition des boutons d'action prédéfinis.
   Chaque bouton appelle un service jow sur le jour actuellement affiché. */
const ACTIONS_PREDEFINIES = {
  meal_done: {
    label: "Marquer comme fait",
    icon: "✓",
    service: "jow.meal_done",
    data: { weekday: "{weekday}" },
    confirm: "Marquer ce repas comme fait ? Ses ingrédients seront retirés de la liste de courses.",
  },
  clear_meal: {
    label: "Effacer ce jour",
    icon: "✕",
    service: "jow.clear_meal",
    data: { weekday: "{weekday}" },
    confirm: "Effacer le repas de ce jour ?",
  },
  refresh_shopping: {
    label: "Régénérer la liste de courses",
    icon: "⟳",
    service: "jow.refresh_shopping_list",
    data: { week_offset: 0, keep_checked: true },
    confirm: null,
  },
  send_jow: {
    label: "Envoyer à Jow",
    icon: "🛒",
    service: null,
    data: null,
    confirm: null,
  },
  copy_meal: {
    label: "Copier vers…",
    icon: "⧉",
    service: "jow.copy_meal",
    data: { weekday: "{weekday}" },
    confirm: null,
  },
  favoris: {
    label: "Choisir parmi mes favoris",
    icon: "★",
    service: "jow.sync_favorites",
    data: {},
    confirm: null,
  },
};

/* États qui signifient « pas de plat », quel que soit l'intégration. */
const ETATS_VIDES = ["unknown", "unavailable", "none", "", "rien de prévu", "rien de prevu"];

const STYLES = `
  :host {
    /* Encre chaude et blanc cassé. Aucune couleur d'accent : la photo
       du plat est déjà saturée, une couleur de marque se battrait avec. */
    --encre:     #1A1816;
    --encre-2:   #2E2A25;
    --filet:     #34302A;
    --filet-fin: #2A2620;
    --papier:    #F2EFE9;
    --gris:      #A39D93;  /* 5:1 sur l'encre — lisible, contrairement au gris d'origine */
    --gris-2:    #6E6961;
  }

  .carte {
    background: var(--encre);
    color: var(--papier);
    border-radius: 14px;
    overflow: hidden;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  /* Les marges par défaut du navigateur sur p/h1 s'additionnent aux nôtres
     et doublent les espacements. On repart de zéro. */
  .carte p, .carte h1 { margin: 0; }
  .mono { font-family: ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace; }

  /* ---- Vue détail ---- */
  .photo {
    display: block;
    width: 100%;
    height: 190px;
    object-fit: cover;
    background: var(--encre-2);
  }
  .detail { padding: 20px 22px 22px; }
  .detail.sans-photo { padding-top: 26px; }

  .surtitre {
    display: flex; align-items: center; gap: 10px;
    font-size: 0.63rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gris);
  }
  .titre:focus { outline: none; }
  .titre {
    margin: 9px 0 0;
    font-size: 1.62rem;
    font-weight: 500;
    line-height: 1.15;
    letter-spacing: -0.02em;
  }
  /* Sans photo, la typographie prend le relais plutôt que de subir le vide. */
  .sans-photo .titre { font-size: 2rem; line-height: 1.1; letter-spacing: -0.025em; margin-top: 12px; }

  .chiffres {
    display: flex; flex-wrap: wrap; align-items: stretch; gap: 8px;
    margin-top: 14px;
  }
  .chiffre {
    display: flex; flex-direction: column; gap: 2px;
    padding: 8px 12px;
    border: 1px solid var(--filet);
    border-radius: 8px;
    background: var(--encre-2);
  }
  .chiffre .v { font-size: 0.95rem; font-weight: 500; color: var(--papier); line-height: 1; }
  .chiffre .l { font-size: 0.6rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--gris); }

  .compo { margin-top: 16px; }
  .compo-titre {
    font-size: 0.62rem; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--gris); margin-bottom: 8px;
  }
  .compo ul {
    list-style: none; padding: 0; margin: 0;
    font-size: 0.85rem; line-height: 1.5;
  }
  .compo li {
    display: flex; align-items: baseline; gap: 10px;
    padding: 5px 0;
    border-bottom: 1px solid var(--filet-fin);
    color: var(--papier);
  }
  .compo li:last-child { border-bottom: 0; }
  .compo li .q {
    flex: none; min-width: 60px;
    font-family: ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace;
    font-size: 0.75rem; color: var(--gris);
  }
  .compo li .n { flex: 1; }
  .compo li .opt { font-size: 0.62rem; color: var(--gris); font-style: italic; }

  .actions {
    display: flex; align-items: center; flex-wrap: wrap; gap: 14px;
    margin-top: 18px;
  }
  .bouton {
    display: inline-flex; align-items: center; gap: 7px;
    min-height: 44px; padding: 0 16px;
    border: 1px solid #4A443C;
    border-radius: 8px;
    background: none;
    color: var(--papier);
    font: inherit; font-size: 0.81rem;
    text-decoration: none;
    cursor: pointer;
  }
  .bouton:hover { border-color: var(--gris); }
  .bouton:focus-visible { outline: 2px solid var(--papier); outline-offset: 2px; }
  .bouton[disabled] { opacity: 0.5; cursor: progress; }
  .suggest-bar { display: flex; gap: 0; margin-top: 12px; }
  .suggest-bar input {
    flex: 1; border: 1px solid var(--filet); border-radius: 8px 0 0 8px;
    background: var(--encre-2); color: var(--papier);
    font: inherit; font-size: 0.81rem; padding: 8px 12px; outline: none;
  }
  .suggest-bar input::placeholder { color: var(--gris); }
  .suggest-bar input:focus { border-color: var(--gris); }
  .suggest-bar button {
    border: 1px solid var(--filet); border-left: none; border-radius: 0 8px 8px 0;
    background: none; color: var(--papier); padding: 8px 14px;
    font: inherit; font-size: 0.81rem; cursor: pointer;
  }
  .suggest-bar button:hover { border-color: var(--gris); }
  .suggest-bar button:disabled { opacity: 0.5; cursor: progress; }
  .covers-adj { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .covers-adj button {
    border: 1px solid var(--filet); border-radius: 50%; background: none;
    color: var(--papier); width: 28px; height: 28px; font: inherit; font-size: 0.9rem;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  .covers-adj button:hover { border-color: var(--gris); }
  .covers-adj span { font-size: 0.78rem; color: var(--gris); }
  .stock-btn {
    border: none; background: none; color: var(--gris); font-size: 0.7rem;
    cursor: pointer; opacity: 0.4; margin-left: auto; padding: 2px 6px;
  }
  .stock-btn:hover { opacity: 1; color: #a33; }
  .ligne.dragging { opacity: 0.4; }
  .ligne.drag-over { outline: 2px dashed var(--gris); outline-offset: -2px; }
  .mois { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--filet); }
  .mois-semaine { background: var(--encre); padding: 6px 4px; }
  .mois-semaine .titre-s { font-size: 0.65rem; color: var(--gris); margin-bottom: 4px; text-transform: uppercase; }
  .mois-jour { display: flex; align-items: center; gap: 4px; padding: 3px 0; font-size: 0.72rem; cursor: pointer; }
  .mois-jour:hover { opacity: 0.7; }
  .mois-jour .court { color: var(--gris); width: 12px; font-size: 0.62rem; }
  .mois-jour .plat { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mois-jour .plat.vide { color: var(--gris); font-style: italic; }
  .toast {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: var(--encre); color: var(--papier); padding: 10px 20px;
    border-radius: 8px; font-size: 0.85rem; z-index: 9999;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3); opacity: 0;
    transition: opacity 0.3s; pointer-events: none;
  }
  .toast.show { opacity: 0.95; }
  .allergenes { font-size: 0.7rem; color: var(--gris); }

  /* Le mode un seul jour supprime l'index : il faut d'autres flèches
     pour parcourir la semaine. */
  .nav { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  .nav button {
    width: 34px; height: 34px;
    display: grid; place-items: center;
    border: 1px solid var(--filet); border-radius: 8px;
    background: none; color: var(--gris);
    font: inherit; font-size: 0.9rem; cursor: pointer;
  }
  .nav button:hover { color: var(--papier); border-color: var(--gris-2); }
  .nav button:focus-visible { outline: 2px solid var(--papier); outline-offset: 2px; }

  /* ---- Index de la semaine ---- */
  .index { border-top: 1px solid var(--filet); padding: 4px 22px 8px; }
  .ligne {
    display: flex; align-items: center; gap: 14px;
    width: 100%;
    min-height: 48px;           /* cible tactile confortable */
    padding: 6px 0;
    background: none; border: 0;
    border-bottom: 1px solid var(--filet-fin);
    color: inherit; font: inherit; text-align: left;
    cursor: pointer;
  }
  .index .ligne:last-child { border-bottom: 0; }
  .ligne.inerte { cursor: default; }
  .ligne:hover .nom { color: #FFF; }
  .ligne:focus-visible { outline: 2px solid var(--papier); outline-offset: 2px; border-radius: 4px; }
  .ligne[aria-current="true"] .jour { color: var(--papier); }

  .jour {
    width: 34px; flex: none;
    font-size: 0.62rem; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--gris);
  }
  .nom { flex: 1; font-size: 0.87rem; line-height: 1.3; }
  .nom.vide { color: var(--gris); }
  .codes { display: block; margin-top: 2px; font-size: 0.62rem; color: var(--gris); }
  .kcal-index { flex: none; font-size: 0.75rem; color: var(--gris); text-align: right; }
  .kcal-index i { font-style: normal; font-size: 0.56rem; }
  .fleche { flex: none; font-size: 0.9rem; color: var(--gris-2); line-height: 1; }

  /* ---- Pied ---- */
  .legende {
    padding: 13px 22px 18px;
    border-top: 1px solid var(--filet);
    font-size: 0.63rem; line-height: 1.7;
    color: var(--gris);
  }
  .vide-total { padding: 34px 22px; text-align: center; color: var(--gris); font-size: 0.87rem; }
  .semaine-bascule {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 22px 0; font-size: 0.7rem; color: var(--gris);
  }
  .semaine-bascule button {
    border: 1px solid var(--filet); border-radius: 6px; background: none;
    color: var(--papier); font: inherit; font-size: 0.72rem; padding: 4px 10px;
    cursor: pointer; opacity: 0.7;
  }
  .semaine-bascule button:hover { opacity: 1; border-color: var(--gris); }
  .semaine-bascule button.actif { opacity: 1; border-color: var(--gris); }

  @media (max-width: 420px) {
    .detail, .index, .legende { padding-left: 16px; padding-right: 16px; }
    .titre { font-size: 1.4rem; }
    .sans-photo .titre { font-size: 1.7rem; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

class WeeklyMenuCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._selection = null;   // index du jour affiché en détail
    this._weekOffset = 0;     // 0 = semaine courante, 1 = semaine prochaine
    this._imagesKO = new Set();
    this._signature = null;
  }

  static getConfigElement() { return document.createElement("weekly-menu-card-editor"); }

  setConfig(config) {
    this._config = { ...DEFAUTS, ...config };
    this._config.days = Number(this._config.days) === 1 ? 1 : 7;
    this._champs = { ...CHAMPS, ...(config.attributes || {}) };
    this._entitesBase = this._config.entities || JOURS.map((j) => `${this._config.prefix}${j}`);
    if (this._entitesBase.length !== 7) {
      throw new Error("weekly-menu-card : il faut exactement 7 entités, de lundi à dimanche.");
    }
    this._signature = null;
    this._occupe = false;
  }

  /** Entités effectivement lues, selon la semaine affichée (S0 ou S+1).
   *  Pour S+1, on utilise entities_s1 si configuré, sinon on ajoute
   *  automatiquement le suffixe _s1 aux entités S0. */
  get _entites() {
    if (this._weekOffset === 0) return this._entitesBase;
    // Si l'utilisateur a configuré des entités S+1 explicites, les utiliser
    const s1 = this._config.entities_s1;
    if (s1 && Object.keys(s1).some((k) => s1[k])) {
      return JOURS.map((j) => s1[j] || `${this._entitesBase[JOURS.indexOf(j)]}_s1`);
    }
    // Sinon, dérivation automatique
    return this._entitesBase.map((id) => {
      if (id.endsWith("_s1")) return id;
      return id + "_s1";
    });
  }

  get hass() { return this._hass; }

  set hass(hass) {
    this._hass = hass;
    // Nettoyer _imagesKO : si une entité a changé (last_updated), on
    // retire son index du Set pour que la nouvelle image puisse s'afficher.
    for (let i = 0; i < this._entites.length; i++) {
      const s = hass.states[this._entites[i]];
      if (!s) continue;
      const prev = this._hass?.states?.[this._entites[i]];
      if (prev && prev.last_updated !== s.last_updated && this._imagesKO.has(i)) {
        this._imagesKO.delete(i);
      }
    }
    const sig = this._entites
      .map((id) => {
        const s = hass.states[id];
        return s ? `${s.state}:${s.last_updated}` : "absent";
      })
      .join("|") + `|${this._weekOffset}|${this._selection}|${this._occupe}|${[...this._imagesKO].join(",")}`;
    if (sig === this._signature) return;
    this._signature = sig;
    this._render();
  }

  getCardSize() {
    // Une semaine vide n'occupe pas la place d'une semaine remplie.
    if (!this._hass) return 11;
    if (this._config?.days === 1) return 7;
    const prevus = JOURS.filter((_, i) => this._jour(i).planned).length;
    return prevus ? 6 + Math.min(prevus, 6) : 3;
  }
  static getStubConfig() { return { type: "custom:weekly-menu-card" }; }

  // ----------------------------------------------------------------

  /** Valeur d'un champ logique, via la correspondance configurée. */
  _champ(attrs, cle) {
    const nom = this._champs[cle];
    return nom ? attrs[nom] : undefined;
  }

  /** Les ingrédients peuvent arriver en objets {name, quantity, unit}
   *  ou en simples chaînes selon l'intégration : on normalise. */
  _ingredients(brut) {
    if (!Array.isArray(brut)) return [];
    return brut.map((x) => (typeof x === "string" || typeof x === "number")
      ? { name: String(x), quantity: null, unit: "", optional: false }
      : {
          name: x?.name ?? x?.title ?? x?.food ?? "",
          quantity: x?.quantity ?? x?.amount ?? null,
          unit: x?.unit ?? "",
          optional: !!(x?.optional ?? x?.is_optional),
        }
    ).filter((x) => x.name);
  }

  /** Les allergènes peuvent être des codes INCO (1-14) ou des libellés. */
  _allergenes(brut) {
    if (!Array.isArray(brut)) return [];
    return brut.map((x) => {
      const n = Number(x);
      return Number.isInteger(n) && n >= 1 && n <= 14
        ? { code: n, label: ALLERGENES[n] }
        : { code: null, label: String(x) };
    }).filter((x) => x.label);
  }

  /** Date du jour i dans la semaine en cours, si l'entité n'en fournit pas. */
  _dateDeduite(i) {
    const t = new Date();
    const lundi = new Date(t);
    lundi.setDate(t.getDate() - ((t.getDay() + 6) % 7) + i);
    return `${lundi.getFullYear()}-${String(lundi.getMonth() + 1).padStart(2, "0")}-${String(lundi.getDate()).padStart(2, "0")}`;
  }

  _jour(i) {
    const etat = this._hass?.states[this._entites[i]];
    if (!etat) return { index: i, absente: true, planned: false };
    const a = etat.attributes || {};

    const nomChamp = this._champs.name;
    const nom = nomChamp ? a[nomChamp] : etat.state;

    // Sans attribut « planned », on déduit du nom : c'est ce qui permet
    // à la carte de fonctionner avec une entité quelconque.
    const drapeau = this._champ(a, "planned");
    const planned = typeof drapeau === "boolean"
      ? drapeau
      : !!nom && !ETATS_VIDES.includes(String(nom).trim().toLowerCase());

    const cal = this._champ(a, "calories");
    const duree = this._champ(a, "duration");
    const cuisson = this._champ(a, "cooking_time") || a.cooking_time || null;

    return {
      index: i,
      planned,
      nom: nom == null ? "" : String(nom),
      image: this._imagesKO.has(i) ? null : (this._champ(a, "image") || a.entity_picture || null),
      url: this._champ(a, "url") || null,
      date: this._champ(a, "date") || this._dateDeduite(i),
      calories: cal == null || cal === "" ? null : (Number.isFinite(Number(cal)) ? Number(cal) : null),
      allergenes: this._allergenes(this._champ(a, "allergens")),
      estimes: this._champ(a, "allergens_source") === "estimated",
      couverts: this._champ(a, "covers") || null,
      preparation: duree || null,
      cuisson: cuisson == null || cuisson === "" ? null : (Number.isFinite(Number(cuisson)) ? Number(cuisson) : null),
      ingredients: this._ingredients(this._champ(a, "ingredients")),
    };
  }

  _aujourdhui() { return (new Date().getDay() + 6) % 7; }

  /** Le jour affiché : celui choisi, sinon aujourd'hui, sinon le prochain plat prévu. */
  _indexAffiche(jours) {
    if (this._selection != null && jours[this._selection]?.planned) return this._selection;
    const auj = this._aujourdhui();
    if (jours[auj].planned) return auj;
    for (let d = 1; d < 7; d++) {
      const i = (auj + d) % 7;
      if (jours[i].planned) return i;
    }
    return null;
  }

  _esc(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  /** Échapper le HTML ne suffit pas dans un href : « javascript: » passerait.
   *  On n'accepte que http(s), et les data: d'image pour les vignettes. */
  _url(brut, imageAutorisee = false) {
    if (!brut) return null;
    const t = String(brut).trim();
    if (/^https?:\/\//i.test(t)) return this._esc(t);
    if (imageAutorisee && /^data:image\//i.test(t)) return this._esc(t);
    return null;
  }

  _dateLisible(iso) {
    if (!iso) return "";
    return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  }

  /** Vue mensuelle compacte : 4 semaines (S-1, S, S+1, S+2) en grille. */
  _vueMensuelle() {
    const semaines = [-1, 0, 1, 2];
    const cellules = semaines.map((offset) => {
      const jours = JOURS.map((_, i) => {
        const id = this._weekOffset === 0
          ? this._entitesBase.map((e) => offset === 0 ? e : e + `_s${offset}`)[i]
          : this._entitesBase.map((e) => e + `_s${offset}`)[i];
        const s = this._hass.states[id];
        if (!s) return { index: i, planned: false, nom: "", offset };
        const a = s.attributes || {};
        const planned = this._champ(a, "planned") ?? (s.state && s.state !== "Rien de prévu" && s.state !== "unavailable");
        return {
          index: i,
          planned: !!planned,
          nom: planned ? (this._champ(a, "name") || s.state) : "",
          offset,
        };
      });
      const label = offset === 0 ? "Cette semaine" : offset === -1 ? "Sem. dernière" : `S+${offset}`;
      const lignes = jours.map((j) => {
        if (j.planned) {
          return `<div class="mois-jour" data-mois-jour="${j.index}" data-mois-offset="${offset}">
            <span class="court mono">${COURTS[j.index]}</span>
            <span class="plat">${this._esc(j.nom)}</span>
          </div>`;
        }
        return `<div class="mois-jour">
          <span class="court mono">${COURTS[j.index]}</span>
          <span class="plat vide">—</span>
        </div>`;
      }).join("");
      return `<div class="mois-semaine"><div class="titre-s">${label}</div>${lignes}</div>`;
    }).join("");
    return `<div class="carte"><div class="semaine-bascule">
      <span>Vue mensuelle</span>
      <button data-semaine="0">Quitter</button>
    </div><div class="mois">${cellules}</div></div>`;
  }

  _render() {
    if (!this._hass || !this._config) return;

    // Vue mensuelle compacte (4 semaines)
    if (this._config.show_month) {
      this.shadowRoot.innerHTML = `<style>${STYLES}</style>${this._vueMensuelle()}`;
      this._brancher();
      return;
    }

    const jours = JOURS.map((_, i) => this._jour(i));
    const vedette = this._indexAffiche(jours);
    const planifies = jours.filter((j) => j.planned);

    const unSeulJour = this._config.days === 1;
    const estimes = planifies.some((j) => j.estimes);
    // En mode un seul jour, la légende ne concerne que le plat affiché.
    const source = unSeulJour && vedette != null ? jours[vedette].allergenes : planifies.flatMap((j) => j.allergenes);
    const codesPied = [...new Map(source.map((x) => [x.label, x])).values()]
      .sort((a, b) => (a.code ?? 99) - (b.code ?? 99) || a.label.localeCompare(b.label));

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="carte">
        <div class="semaine-bascule">
          <span>${this._weekOffset === 0 ? "Cette semaine" : "Semaine prochaine"}</span>
          <span>
            <button data-semaine="0" class="${this._weekOffset === 0 ? "actif" : ""}">S</button>
            <button data-semaine="1" class="${this._weekOffset === 1 ? "actif" : ""}">S+1</button>
          </span>
        </div>
        ${(this._config.actions || {}).refresh_shopping ? `
          <div style="padding:8px 22px 4px">
            <button class="bouton" data-action-predefinie="refresh_shopping" data-jour-action="${vedette ?? 0}"${this._occupe ? " disabled" : ""}>
              ⟳ Régénérer la liste de courses
            </button>
          </div>` : ""}
        ${vedette == null ? `
          <p class="vide-total">${this._entites.some((id) => this._hass.states[id])
            ? "Aucun repas planifié " + (this._weekOffset === 0 ? "cette semaine." : "pour la semaine prochaine.")
            : "Aucune des entités configurées n'existe. Vérifiez la configuration de la carte."}</p>
          ${this._action() ? this._barreSuggestVide() : ""}`
          : this._vueDetail(jours[vedette], planifies.length)}
        ${unSeulJour ? "" : this._index(jours, vedette)}
        ${unSeulJour ? "" : this._boutonSemaineSuivante()}
        ${this._config.show_allergens && codesPied.length ? `
          <p class="legende">
            ${codesPied.map((c) => this._esc(c.code ? `${c.code} ${c.label}` : c.label)).join(" · ")}${
              estimes ? " — déduits des ingrédients, à vérifier en cas d'allergie" : ""}
          </p>` : ""}
        ${this._config.show_week_calories && planifies.length ? `
          <p class="legende mono">
            ${(() => {
              const total = planifies.reduce((s, j) => s + (j.calories || 0), 0);
              const moy = Math.round(total / planifies.length);
              return `${total} kcal/semaine · ${moy} kcal/jour (${planifies.length}/${jours.length} repas)`;
            })()}
          </p>` : ""}
      </div>`;

    this._brancher();
  }

  /** Barre de saisie pour la vue "aucun repas planifié" : cible le
   *  premier jour vide de la semaine (typiquement lundi). */
  _barreSuggestVide() {
    const occupe = this._occupe;
    // Trouver le premier jour non planifié
    let premierVide = 0;
    for (let i = 0; i < 7; i++) {
      if (!this._jour(i).planned) { premierVide = i; break; }
    }
    return `<div class="suggest-bar" style="max-width:400px;margin:0 auto">
      <input type="text" data-suggest-input="${premierVide}" placeholder="Proposer un plat pour ${JOURS[premierVide]}\u2026"${occupe ? " disabled" : ""}>
      <button data-suggest-go="${premierVide}"${occupe ? " disabled" : ""}>${occupe ? "\u2026" : "Go"}</button>
    </div>`;
  }

  _vueDetail(j, nbPlanifies) {
    const photo = this._url(j.image, true);
    const lien = this._url(j.url);
    const sansPhoto = !photo;
    const auj = j.index === this._aujourdhui();
    const surtitre = auj
      ? `Ce soir · ${JOURS[j.index]} ${this._dateLisible(j.date)}`
      : `${JOURS[j.index]} ${this._dateLisible(j.date)}`;

    const nav = (this._config.days === 1 && nbPlanifies > 1)
      ? `<span class="nav">
           <button data-pas="-1" aria-label="Plat précédent">\u2039</button>
           <button data-pas="1" aria-label="Plat suivant">\u203a</button>
         </span>`
      : "";

    const chiffres = [];
    if (this._config.show_calories) {
      if (j.calories != null) {
        const total = j.couverts && j.couverts > 1 ? j.calories * j.couverts : null;
        chiffres.push(`<div class="chiffre"><span class="v">${j.calories} kcal</span><span class="l">par portion</span></div>`);
        if (total) chiffres.push(`<div class="chiffre"><span class="v">${total} kcal</span><span class="l">total · ${j.couverts} portions</span></div>`);
      } else {
        chiffres.push(`<div class="chiffre"><span class="v">—</span><span class="l">kcal inconnues</span></div>`);
      }
    }
    if (j.preparation) chiffres.push(`<div class="chiffre"><span class="v">${j.preparation} min</span><span class="l">préparation</span></div>`);
    if (j.cuisson) chiffres.push(`<div class="chiffre"><span class="v">${j.cuisson} min</span><span class="l">cuisson</span></div>`);
    if (j.couverts) chiffres.push(`<div class="chiffre"><span class="v">${j.couverts}</span><span class="l">couvert${j.couverts > 1 ? "s" : ""}</span></div>`);

    // Liste structurée des ingrédients : quantité en mono à gauche, nom à droite.
    const items = j.ingredients.map((i) => {
      const q = i.quantity
        ? `<span class="q">${this._esc(i.quantity)}${i.unit ? " " + this._esc(i.unit) : ""}</span>`
        : `<span class="q"></span>`;
      const opt = i.optional ? ` <span class="opt">facultatif</span>` : "";
      return `<li>${q}<span class="n">${this._esc(i.name)}${opt}</span><button class="stock-btn" data-stock="${this._esc(i.name)}" title="Déjà en stock — retirer de la liste">✕</button></li>`;
    });
    const compo = items.length
      ? `<div class="compo"><p class="compo-titre">Ingrédients · ${items.length}</p><ul>${items.join("")}</ul></div>`
      : `<div class="compo"><p class="compo-titre">Ingrédients</p><p style="color:var(--gris);font-size:0.85rem">Non renseignés.</p></div>`;

    const all = j.allergenes.length
      ? `Allergènes · ${j.allergenes.map((c) => (c.code ? `${c.code} ${c.label}` : c.label)).join(" · ")}`
      : "Sans allergène signalé";

    // Bouton « Changer de recette » : présent uniquement si un replace_action
    // est configuré. Déclenche le service (jow.suggest ou autre) qui fera
    // choisir une nouvelle recette par l'IA selon les critères fournis.
    const action = this._action();
    const occupe = this._occupe;

    // Barre de saisie libre : l'utilisateur tape une phrase (ex: "plat
    // rapide avec du bœuf") et Entrée déclenche jow.suggest avec ce
    // texte comme criteria pour le jour affiché.
    const barreSuggest = action
      ? `<div class="suggest-bar">
           <input type="text" data-suggest-input="${j.index}" placeholder="Proposer un plat\u2026 (ex : rapide avec du bœuf)"${occupe ? " disabled" : ""}>
           <button data-suggest-go="${j.index}"${occupe ? " disabled" : ""}>${occupe ? "\u2026" : "Go"}</button>
         </div>`
      : "";

    const boutonChanger = action
      ? `<button class="bouton changer" data-remplacer-detail="${j.index}"${occupe ? " disabled" : ""}>
           ${occupe ? "Recherche en cours\u2026" : "Changer de recette"}
         </button>`
      : "";

    // Boutons d'action prédéfinis (meal_done, clear_meal, send_jow, copy_meal, favoris)
    // refresh_shopping est déplacé en bas de la carte (pas dans le détail)
    const actionsConfig = this._config.actions || {};
    const boutonsActions = Object.entries(ACTIONS_PREDEFINIES)
      .filter(([key]) => key !== "refresh_shopping" && actionsConfig[key] !== false)
      .map(([key, def]) => {
        // Le bouton "Envoyer à Jow" ouvre les recettes dans des onglets,
        // pas un appel de service.
        if (key === "send_jow") {
          return `<button class="bouton action" data-envoyer-jow="1"${this._occupe ? " disabled" : ""}>
            <span>${def.icon}</span> ${this._esc(def.label)}
          </button>`;
        }
        const confirmAttr = def.confirm ? ` data-confirm="${this._esc(def.confirm)}"` : "";
        return `<button class="bouton action" data-action-predefinie="${key}" data-jour-action="${j.index}"${this._occupe ? " disabled" : ""}${confirmAttr}>
          <span>${def.icon}</span> ${this._esc(def.label)}
        </button>`;
      }).join("");

    return `
      ${photo ? `<img class="photo" src="${photo}" alt="" data-photo="${j.index}">` : ""}
      <div class="detail${sansPhoto ? " sans-photo" : ""}">
        <p class="surtitre mono"><span>${this._esc(surtitre)}</span>${nav}</p>
        <h1 class="titre" tabindex="-1">${this._esc(j.nom)}</h1>
        <div class="chiffres">${chiffres.join("")}</div>
        <div class="covers-adj">
          <button data-covers-minus="${j.index}"${this._occupe ? " disabled" : ""}>−</button>
          <span>${j.couverts || this._config.covers || 2} couvert${(j.couverts || this._config.covers || 2) > 1 ? "s" : ""}</span>
          <button data-covers-plus="${j.index}"${this._occupe ? " disabled" : ""}>+</button>
        </div>
        ${compo}
        ${barreSuggest}
        <div class="actions">
          ${lien ? `<a class="bouton" href="${lien}" target="_blank" rel="noopener noreferrer">Voir la recette ↗</a>` : ""}
          ${boutonChanger}
          ${boutonsActions}
        </div>
        ${this._config.show_allergens ? `<p class="allergenes mono" style="margin-top:12px;font-size:0.7rem;color:var(--gris)">${this._esc(all)}</p>` : ""}
      </div>`;
  }

  _index(jours, vedette) {
    const lignes = jours.filter((j) => j.index !== vedette);
    if (!lignes.length) return "";

    return `<div class="index">${lignes.map((j) => {
      if (j.absente) {
        return `<div class="ligne" aria-disabled="true">
          <span class="jour mono">${COURTS[j.index]}</span>
          <span class="nom vide">Entité introuvable</span></div>`;
      }
      if (!j.planned) {
        // Sans recherche configurée, le « + » n'aurait rien à faire :
        // la ligne reste inerte plutôt que de simuler une action.
        return this._action()
          ? `<button class="ligne" data-remplacer="${j.index}" data-drop-jour="${j.index}"${this._occupe ? " disabled" : ""}>
               <span class="jour mono">${COURTS[j.index]}</span>
               <span class="nom vide">${this._occupe ? "En cours\u2026" : "Rien de prévu \u2014 en proposer un"}</span>
               <span class="fleche">+</span></button>`
          : `<div class="ligne inerte" data-drop-jour="${j.index}">
               <span class="jour mono">${COURTS[j.index]}</span>
               <span class="nom vide">Rien de prévu</span>
               <span class="fleche">+</span></div>`;
      }
      const codes = this._config.show_allergens && j.allergenes.length
        ? `<span class="codes mono">allergènes ${this._esc(j.allergenes.map((c) => c.code ? `${c.code} ${c.label}` : c.label).join(" · "))}</span>` : "";
      const kcal = this._config.show_calories && j.calories != null
        ? `<span class="kcal-index mono">${j.calories}<i> kcal/portion</i></span>` : "";
      return `<button class="ligne" data-jour="${j.index}" data-drag-jour="${j.index}" data-drop-jour="${j.index}" draggable="true">
        <span class="jour mono">${COURTS[j.index]}</span>
        <span class="nom">${this._esc(j.nom)}${codes}</span>
        ${kcal}
        <span class="fleche">›</span>
      </button>`;
    }).join("")}</div>`;
  }

  /** Bouton pour planifier toute la semaine prochaine via jow.suggest.
   *  Appelle le service 7 fois (une par jour) avec week_offset=1, en
   *  dédupliquant les recettes déjà planifiées. */
  _boutonSemaineSuivante() {
    const action = this._action();
    if (!action) return "";
    // Respecter le flag plan_next_enabled de l'éditeur (défaut: activé)
    if (this._config.plan_next_enabled === false) return "";
    // Afficher le bouton seulement si on est sur la semaine courante
    // (sur S+1, le bouton "Planifier S+1" n'a pas de sens)
    if (this._weekOffset !== 0) return "";
    return `<div class="index" style="border-top:1px solid var(--filet)">
      <button class="ligne" data-planifier-s1="${this._occupe ? "" : "1"}"${this._occupe ? " disabled" : ""}>
        <span class="jour mono">S+1</span>
        <span class="nom vide">${this._occupe ? "Planification en cours\u2026" : "Planifier la semaine prochaine"}</span>
        <span class="fleche">+</span>
      </button>
    </div>`;
  }

  async _planifierSemaineSuivante() {
    const action = this._action();
    if (this._occupe || !this._hass || !action) return;

    this._occupe = true;
    this._signature = null;
    this._render();
    this._toast("Planification S+1 en cours…");

    let succes = 0;
    let echecs = 0;

    // Appeler le service pour chaque jour, avec week_offset=1
    for (let i = 0; i < 7; i++) {
      const remplir = (v) => (typeof v === "string"
        ? v.replace("{weekday}", JOURS[i]).replace("{index}", String(i))
        : v);
      const data = Object.fromEntries(
        Object.entries(action.data).map(([k, v]) => [k, remplir(v)])
      );
      data.week_offset = 1;
      // Enrichir avec le thème du jour et le frigo (fallback si vide)
      data.criteria = this._criteriaAvecContexte(i, data.criteria) || "plat varié équilibré";
      try {
        await this._hass.callService(action.domaine, action.service, data);
        succes++;
        this._toast(`S+1 : ${succes}/7 jours planifiés`);
      } catch (err) {
        echecs++;
        console.error(`weekly-menu-card : échec planification S+1 ${JOURS[i]}`, err);
        this._toast(`✕ Échec ${JOURS[i]} — erreur`, true);
      }
      this._signature = null;
      this._render();
    }

    this._occupe = false;
    this._signature = null;
    this._render();
    if (echecs === 0) {
      this._toast(`✓ Semaine prochaine planifiée (${succes}/7)`);
    } else {
      this._toast(`S+1 : ${succes} réussis, ${echecs} échecs`, true);
    }
    setTimeout(() => { this._signature = null; this._render(); }, 5000);
  }

  /** Appelle une action prédéfinie (meal_done, clear_meal, refresh_shopping)
   *  sur le jour actuellement affiché. */
  async _actionPredefinie(key, jourIndex) {
    const def = ACTIONS_PREDEFINIES[key];
    if (!def || this._occupe || !this._hass) return;

    // Confirmation si nécessaire
    if (def.confirm && !window.confirm(def.confirm)) return;

    // Cas spécial : copy_meal demande un jour cible
    if (key === "copy_meal") {
      const choix = window.prompt("Copier vers quel jour ?\n(lundi, mardi, …, dimanche)", JOURS[(jourIndex + 1) % 7]);
      if (!choix) return;
      const jourCible = choix.trim().toLowerCase();
      const idxCible = JOURS.indexOf(jourCible);
      if (idxCible < 0) { this._toast("✕ Jour non reconnu", true); return; }
      const data = {
        weekday: JOURS[jourIndex],
        to_weekday: JOURS[idxCible],
        week_offset: this._weekOffset,
        to_week_offset: this._weekOffset,
      };
      this._occupe = true;
      this._signature = null;
      this._render();
      try {
        await this._hass.callService("jow", "copy_meal", data);
        this._toast(`✓ Repas copié vers ${JOURS[idxCible]}`);
      } catch (err) {
        console.error("weekly-menu-card : échec copy_meal", err);
        this._toast("✕ Copie échouée — erreur", true);
      } finally {
        this._occupe = false;
        this._signature = null;
        this._render();
        setTimeout(() => { this._signature = null; this._render(); }, 3000);
      }
      return;
    }

    // Cas spécial : favoris affiche les recettes dans une fenêtre
    if (key === "favoris") {
      this._occupe = true;
      this._signature = null;
      this._render();
      try {
        // callService sans return_response (incompatible).
        // On appelle le service qui stocke les favoris, puis on les lit
        // via callWS get_states sur une entite dediee.
        await this._hass.callService("jow", "sync_favorites", {});
        // Lire les favoris depuis le sensor jow_repas_du_jour ou une entite dediee
        // En attendant, on ouvre une fenetre avec un message
        this._toast("✓ Favoris synchronisés — voir la liste de courses");
      } catch (err) {
        console.error("weekly-menu-card : échec favoris", err);
        this._toast("✕ Favoris indisponibles — token requis", true);
      } finally {
        this._occupe = false;
        this._signature = null;
        this._render();
      }
      return;
    }

    const [domaine, service] = def.service.split(".", 2);
    if (!domaine || !service) return;

    // Remplir les jetons {weekday}, {index}
    const remplir = (v) => (typeof v === "string"
      ? v.replace("{weekday}", JOURS[jourIndex]).replace("{index}", String(jourIndex))
      : v);
    const data = Object.fromEntries(
      Object.entries(def.data).map(([k, v]) => [k, remplir(v)])
    );

    this._occupe = true;
    this._signature = null;
    this._render();
    try {
      await this._hass.callService(domaine, service, data);
      this._toast(`✓ ${def.label}`);
    } catch (err) {
      console.error(`weekly-menu-card : échec de ${def.service}`, err);
      this._toast(`✕ ${def.label} — erreur`, true);
    } finally {
      this._occupe = false;
      this._signature = null;
      this._render();
      setTimeout(() => { this._signature = null; this._render(); }, 3000);
    }
  }

  /** Affiche un message éphémère en bas de la carte. */
  _toast(msg, isError = false) {
    const R = this.shadowRoot;
    if (!R) return;
    let el = R.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      R.appendChild(el);
    }
    el.textContent = msg;
    if (isError) el.style.background = "#a33";
    else el.style.background = "";
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
  }

  /** Déplace un plat d'un jour à un autre (copy_meal + clear_meal source). */
  async _deplacerPlat(from, to) {
    if (this._occupe || !this._hass) return;
    this._occupe = true;
    this._signature = null;
    this._render();
    try {
      await this._hass.callService("jow", "copy_meal", {
        weekday: JOURS[from],
        to_weekday: JOURS[to],
        week_offset: this._weekOffset,
        to_week_offset: this._weekOffset,
      });
      await this._hass.callService("jow", "clear_meal", {
        weekday: JOURS[from],
        week_offset: this._weekOffset,
      });
      this._toast(`✓ Plat déplacé vers ${JOURS[to]}`);
    } catch (err) {
      console.error("weekly-menu-card : échec déplacement", err);
      this._toast("✕ Déplacement échoué — erreur", true);
    } finally {
      this._occupe = false;
      this._signature = null;
      this._render();
      setTimeout(() => { this._signature = null; this._render(); }, 3000);
    }
  }

  /** Change le nombre de couverts d'un jour via le service jow.set_covers. */
  async _changerCouverts(i, delta) {
    const jour = this._jour(i);
    if (!jour?.planned || this._occupe || !this._hass) return;
    const actuel = jour.couverts || this._config.covers || 2;
    const nouveau = Math.max(1, Math.min(20, actuel + delta));
    if (nouveau === actuel) return;
    try {
      await this._hass.callService("jow", "set_covers", {
        weekday: JOURS[i],
        week_offset: this._weekOffset,
        covers: nouveau,
      });
      this._toast(`✓ ${nouveau} couvert${nouveau > 1 ? "s" : ""} pour ${JOURS[i]}`);
    } catch (err) {
      console.error("weekly-menu-card : échec set_covers", err);
      this._toast("✕ Couverts non modifiés — erreur", true);
    }
  }

  /** Construit le criteria enrichi : criteria de base + thème du jour +
   *  ingrédients du frigo. Permet à l'IA de contextualiser la suggestion. */
  _criteriaAvecContexte(i, criteriaBase) {
    const parts = [];
    // Thème du jour (ex: "végétarien", "poisson", "plaisir")
    const theme = this._config.day_themes?.[JOURS[i]];
    if (theme) parts.push(theme);
    // Ingrédients du frigo
    const frigo = this._config.fridge_ingredients?.trim();
    if (frigo) parts.push(`avec ${frigo}`);
    // Critère de base (saisi ou configuré)
    if (criteriaBase?.trim()) parts.push(criteriaBase.trim());
    return parts.join(", ");
  }

  /** Ouvre les recettes de la semaine sur jow.fr dans des onglets.
   *  L'utilisateur n'a plus qu'à cliquer "Ajouter au menu" sur chacune.
   *  On ouvre le premier onglet directement (user gesture, pas de popup
   *  blocker) et les autres via une fenêtre intermédiaire avec des liens. */
  _envoyerJow() {
    const jours = JOURS.map((_, i) => this._jour(i));
    const planifies = jours.filter((j) => j.planned && j.url);
    if (!planifies.length) return;

    // Valider les URLs via _url() (filtre javascript:, etc.)
    const urls = planifies
      .map((j) => this._url(j.url))
      .filter(Boolean);
    if (!urls.length) return;

    // Ouvrir le premier onglet immédiatement (dans le user gesture, pas
    // bloqué par le popup blocker).
    window.open(urls[0], "_blank", "noopener,noreferrer");

    // Pour les suivants : ouvrir une fenêtre avec des liens cliquables
    // (les popups différés sont bloqués par les navigateurs).
    if (urls.length > 1) {
      const liens = urls.map((u, i) => `<li><a href="${u}" target="_blank" rel="noopener noreferrer">Recette ${i + 1}</a></li>`).join("");
      const html = `<html><head><title>Recettes Jow</title><style>body{font-family:system-ui;padding:30px}li{margin:8px 0}a{color:#1a1816}</style></head><body><h2>Ouvrir les recettes sur Jow</h2><ul>${liens}</ul></body></html>`;
      const w = window.open("", "_blank", "noopener,noreferrer");
      if (w) {
        w.document.write(html);
        w.document.close();
      }
    }
  }

  _afficher(i) {
    if (!this._jour(i).planned) return;
    this._selection = i;
    this._signature = null;
    this._render();
    // _render() reconstruit le DOM : sans cela, le focus clavier
    // retomberait au début du document après chaque clic.
    this.shadowRoot.querySelector(".titre")?.focus();
  }

  /** Passe au plat planifié suivant ou précédent, en bouclant sur la semaine. */
  _decaler(pas) {
    const jours = JOURS.map((_, i) => this._jour(i));
    const courant = this._indexAffiche(jours);
    if (courant == null) return;
    for (let n = 1; n <= 7; n++) {
      const i = ((courant + pas * n) % 7 + 7) % 7;
      if (jours[i].planned) { this._afficher(i); return; }
    }
  }

  _action() {
    const a = this._config.replace_action;
    if (!a || typeof a.service !== "string" || !a.service.includes(".")) return null;
    const [domaine, service] = a.service.split(".", 2);
    return domaine && service ? { domaine, service, data: a.data || {} } : null;
  }

  /** Appelle le service configuré pour ce jour. Aucun domaine n'est supposé :
   *  ce peut être jow.plan_meal, un script, une automatisation… */
  async _remplacer(i) {
    const action = this._action();
    if (this._occupe || !this._hass || !action) return;
    const jour = this._jour(i);

    // Les jetons {date} et {weekday} permettent de viser le bon jour sans
    // que la carte connaisse la signature du service.
    const remplir = (v) => (typeof v === "string"
      ? v.replace("{date}", jour.date).replace("{weekday}", JOURS[i]).replace("{index}", String(i))
      : v);
    const data = Object.fromEntries(
      Object.entries(action.data).map(([k, v]) => [k, remplir(v)])
    );
    data.week_offset = this._weekOffset;
    // Enrichir le criteria avec le thème du jour et le frigo
    data.criteria = this._criteriaAvecContexte(i, data.criteria);

    this._occupe = true;
    this._signature = null;
    this._render();
    try {
      await this._hass.callService(action.domaine, action.service, data);
    } catch (err) {
      console.error(`weekly-menu-card : échec de ${action.domaine}.${action.service}`, err);
      this._toast("✕ Recette non remplacée — erreur", true);
    } finally {
      this._occupe = false;
      this._signature = null;
      this._render();
      // Le service jow.suggest met du temps (IA + recherche). L'état de
      // l'entité peut arriver après le finally : on force un re-render
      // après 3s et 8s pour récupérer la nouvelle recette.
      setTimeout(() => { this._signature = null; this._render(); }, 3000);
      setTimeout(() => { this._signature = null; this._render(); }, 8000);
    }
  }

  /** Appelle le service configuré avec un critère personnalisé saisi par
   *  l'utilisateur (barre de saisie). Remplace le criteria par défaut par
   *  le texte tapé, garde les autres paramètres (weekday, couverts, etc.). */
  async _suggest(i, texte) {
    const action = this._action();
    if (this._occupe || !this._hass || !action || !texte?.trim()) return;
    const jour = this._jour(i);

    const remplir = (v) => (typeof v === "string"
      ? v.replace("{date}", jour.date).replace("{weekday}", JOURS[i]).replace("{index}", String(i))
      : v);
    const data = Object.fromEntries(
      Object.entries(action.data).map(([k, v]) => [k, remplir(v)])
    );
    // Le critère saisi est enrichi avec le thème du jour et le frigo
    data.criteria = this._criteriaAvecContexte(i, texte.trim());
    data.week_offset = this._weekOffset;

    this._occupe = true;
    this._signature = null;
    this._render();
    try {
      await this._hass.callService(action.domaine, action.service, data);
      this._toast(`✓ Recherche lancée pour ${JOURS[i]}`);
    } catch (err) {
      console.error(`weekly-menu-card : échec suggest personnalisé`, err);
      this._toast("✕ Recherche échouée — erreur", true);
    } finally {
      this._occupe = false;
      this._signature = null;
      this._render();
      setTimeout(() => { this._signature = null; this._render(); }, 3000);
      setTimeout(() => { this._signature = null; this._render(); }, 8000);
    }
  }

  _brancher() {
    const R = this.shadowRoot;

    R.querySelectorAll(".ligne[data-jour]").forEach((el) => {
      el.addEventListener("click", () => this._afficher(Number(el.dataset.jour)));
    });

    R.querySelectorAll(".nav button").forEach((el) => {
      el.addEventListener("click", () => this._decaler(Number(el.dataset.pas)));
    });

    R.querySelectorAll("[data-remplacer]").forEach((el) => {
      el.addEventListener("click", () => this._remplacer(Number(el.dataset.remplacer)));
    });

    R.querySelectorAll("[data-remplacer-detail]").forEach((el) => {
      el.addEventListener("click", () => this._remplacer(Number(el.dataset.remplacerDetail)));
    });

    R.querySelectorAll("[data-planifier-s1]").forEach((el) => {
      el.addEventListener("click", () => this._planifierSemaineSuivante());
    });

    R.querySelectorAll("[data-action-predefinie]").forEach((el) => {
      el.addEventListener("click", () => {
        this._actionPredefinie(el.dataset.actionPredefinie, Number(el.dataset.jourAction));
      });
    });

    R.querySelectorAll("[data-envoyer-jow]").forEach((el) => {
      el.addEventListener("click", () => this._envoyerJow());
    });

    // Barre de saisie "Proposer un plat" : Entrée ou clic sur Go
    R.querySelectorAll("[data-suggest-input]").forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this._suggest(Number(input.dataset.suggestInput), input.value);
        }
      });
    });
    R.querySelectorAll("[data-suggest-go]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = R.querySelector(`[data-suggest-input="${btn.dataset.suggestGo}"]`);
        if (input) this._suggest(Number(btn.dataset.suggestGo), input.value);
      });
    });

    // Bascule entre semaine courante (S) et semaine prochaine (S+1)
    R.querySelectorAll("[data-semaine]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const offset = Number(btn.dataset.semaine);
        if (offset !== this._weekOffset) {
          this._weekOffset = offset;
          this._selection = null;
          this._imagesKO.clear();
          this._signature = null;
          this._render();
        }
      });
    });

    // Boutons +/- couverts
    R.querySelectorAll("[data-covers-minus]").forEach((btn) => {
      btn.addEventListener("click", () => this._changerCouverts(Number(btn.dataset.coversMinus), -1));
    });
    R.querySelectorAll("[data-covers-plus]").forEach((btn) => {
      btn.addEventListener("click", () => this._changerCouverts(Number(btn.dataset.coversPlus), 1));
    });

    // Bouton "En stock" (retirer un ingrédient de la liste de courses)
    R.querySelectorAll("[data-stock]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ing = btn.dataset.stock;
        try {
          await this._hass.callService("jow", "exclude_ingredient", { ingredient: ing });
          this._toast(`✓ ${ing} retiré de la liste`);
        } catch (err) {
          this._toast("✕ Erreur", true);
        }
      });
    });

    // Drag & drop : déplacer un plat d'un jour à l'autre
    R.querySelectorAll("[data-drag-jour]").forEach((el) => {
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", el.dataset.dragJour);
        el.classList.add("dragging");
      });
      el.addEventListener("dragend", () => el.classList.remove("dragging"));
    });
    R.querySelectorAll("[data-drop-jour]").forEach((el) => {
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.classList.add("drag-over");
      });
      el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
      el.addEventListener("drop", async (e) => {
        e.preventDefault();
        el.classList.remove("drag-over");
        const from = e.dataTransfer.getData("text/plain");
        const to = el.dataset.dropJour;
        if (from && to && from !== to) {
          await this._deplacerPlat(Number(from), Number(to));
        }
      });
    });

    // Une URL d'image morte ne doit pas laisser un aplat vide : on bascule
    // sur la mise en page typographique.
    const img = R.querySelector("img[data-photo]");
    if (img) {
      img.addEventListener("error", () => {
        this._imagesKO.add(Number(img.dataset.photo));
        this._signature = null;
        this._render();
      }, { once: true });
    }
  }
}


/* ------------------------------------------------------------------ */
/* Éditeur graphique                                                    */
/* ------------------------------------------------------------------ */

const LIBELLES = {
  // ---- Affichage ----
  title: "Titre (facultatif)",
  days: "Mode d'affichage",
  show_calories: "Afficher les calories",
  show_allergens: "Afficher les allergènes",
  show_week_calories: "Afficher le total calories de la semaine",
  show_month: "Vue mensuelle (4 semaines compactes)",
  // ---- Thèmes & Frigo ----
  context_section: "Thèmes par jour & Inventaire du frigo",
  day_themes_lundi: "Thème lundi (ex : végétarien)",
  day_themes_mardi: "Thème mardi (ex : poisson)",
  day_themes_mercredi: "Thème mercredi (ex : pâtes)",
  day_themes_jeudi: "Thème jeudi (ex : volaille)",
  day_themes_vendredi: "Thème vendredi (ex : plaisir)",
  day_themes_samedi: "Thème samedi (ex : cuisine du monde)",
  day_themes_dimanche: "Thème dimanche (ex : restes du frigo)",
  fridge_ingredients: "Ingrédients disponibles (séparés par virgules)",
  // ---- Bouton « Changer de recette » ----
  replace_section: "Bouton « Changer de recette » (IA)",
  replace_enabled: "Activer le bouton",
  replace_service: "Service Home Assistant à appeler",
  replace_criteria: "Critères / prompt pour l'IA",
  replace_criteria_help: "Ex : « plat varié équilibré », « dîner léger et rapide », « recette de saison simple »",
  replace_covers: "Nombre de couverts (portions)",
  replace_weather: "Entité météo (adapte selon le temps)",
  replace_ai: "Agent IA (génère la requête de recherche Jow)",
  replace_limit: "Nombre de suggestions à récupérer",
  // ---- Bouton « Planifier la semaine prochaine » ----
  plan_next_section: "Bouton « Planifier la semaine prochaine »",
  plan_next_enabled: "Activer le bouton de planification S+1",
  // ---- Boutons d'action prédéfinis ----
  actions_section: "Boutons d'action (sur le jour affiché)",
  action_meal_done: "Bouton « Marquer comme fait »",
  action_clear_meal: "Bouton « Effacer ce jour »",
  action_refresh_shopping: "Bouton « Régénérer la liste de courses »",
  action_send_jow: "Bouton « Envoyer à Jow » (ouvre les recettes)",
  action_copy_meal: "Bouton « Copier vers… » (restes du lendemain)",
  action_favoris: "Bouton « Choisir parmi mes favoris »",
  // ---- Entités ----
  entites: "Entités des 7 jours (lundi à dimanche)",
  entites_s1: "Entités S+1 (semaine prochaine — auto si vide)",
  // ---- Correspondance des attributs (avancé) ----
  attributes_section: "Correspondance des attributs (avancé)",
  attributes_help: "À modifier uniquement si vos entités utilisent d'autres noms d'attributs que ha-jow",
  attr_name: "Attribut du nom du plat (vide = état de l'entité)",
  attr_planned: "Attribut « plat planifié » (booléen)",
  attr_image: "Attribut de l'image",
  attr_url: "Attribut du lien vers la recette",
  attr_date: "Attribut de la date",
  attr_calories: "Attribut des calories (par portion)",
  attr_allergens: "Attribut des allergènes (liste)",
  attr_covers: "Attribut du nombre de couverts",
  attr_duration: "Attribut du temps de préparation (min)",
  attr_cooking_time: "Attribut du temps de cuisson (min)",
  attr_ingredients: "Attribut des ingrédients (liste)",
};

class WeeklyMenuCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = { ...DEFAUTS };
  }

  setConfig(config) {
    this._config = { ...DEFAUTS, ...config };
    this._rendre();
  }

  set hass(hass) { this._hass = hass; this._rendre(); }
  get hass() { return this._hass; }

  /** Les 7 entités sous forme de champs nommés, déduites du préfixe si besoin. */
  _entitesCourantes() {
    const liste = (this._config.entities && this._config.entities.length === 7)
      ? this._config.entities
      : JOURS.map((j) => `${this._config.prefix || DEFAUTS.prefix}${j}`);
    return Object.fromEntries(JOURS.map((j, i) => [j, liste[i]]));
  }

  /** Assemble replace_action à partir des champs de l'éditeur. */
  _fabriquerAction(v) {
    if (!v.replace_enabled) return null;
    const service = v.replace_service || "jow.suggest";
    if (!service.includes(".")) return null;
    const data = {};
    if (v.replace_criteria) data.criteria = v.replace_criteria;
    data.weekday = "{weekday}";
    if (v.replace_covers) data.covers = Number(v.replace_covers);
    if (v.replace_weather) data.weather_entity = v.replace_weather;
    if (v.replace_ai) data.ai_entity = v.replace_ai;
    if (v.replace_limit) data.limit = Number(v.replace_limit);
    return { service, data };
  }

  _fabriquerAttributes(v) {
    const attrs = {};
    const map = [
      ["attr_name", "name"], ["attr_planned", "planned"], ["attr_image", "image"],
      ["attr_url", "url"], ["attr_date", "date"], ["attr_calories", "calories"],
      ["attr_allergens", "allergens"], ["attr_covers", "covers"],
      ["attr_duration", "duration"], ["attr_cooking_time", "cooking_time"],
      ["attr_ingredients", "ingredients"],
    ];
    let hasCustom = false;
    for (const [key, champ] of map) {
      const val = v[key];
      if (val !== undefined && val !== "") {
        attrs[champ] = val === "null" ? null : val;
        if (val !== CHAMPS[champ]) hasCustom = true;
      }
    }
    return hasCustom ? attrs : undefined;
  }

  _emettre(config) {
    // On ne conserve pas les valeurs par défaut dans le YAML : une config
    // minimale reste lisible.
    Object.keys(DEFAUTS).forEach((k) => {
      if (k !== "prefix" && config[k] === DEFAUTS[k]) delete config[k];
    });
    if (!config.title) delete config.title;
    this._config = { ...DEFAUTS, ...config };
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config },
      bubbles: true,
      composed: true,
    }));
  }

  _rendre() {
    if (!this._hass || !this._config) return;
    // ha-form vient du frontend de Home Assistant. Hors de HA (maquette,
    // test), on retombe sur des champs classiques plutôt qu'un écran vide.
    if (customElements.get("ha-form")) this._rendreHaForm();
    else this._rendreSimple();
  }

  _schema() {
    return [
      // ---- Affichage ----
      { name: "title", selector: { text: {} } },
      { name: "days", selector: { select: { mode: "dropdown", options: [
        { value: "7", label: "Semaine entière — détail + index" },
        { value: "1", label: "Un seul plat, avec flèches" },
      ] } } },
      { name: "show_calories", selector: { boolean: {} } },
      { name: "show_allergens", selector: { boolean: {} } },
      { name: "show_week_calories", selector: { boolean: {} } },
      { name: "show_month", selector: { boolean: {} } },
      // ---- Thèmes & Frigo ----
      { type: "expandable", name: "context_section", title: LIBELLES.context_section, schema: [
        { name: "day_themes_lundi", selector: { text: {} } },
        { name: "day_themes_mardi", selector: { text: {} } },
        { name: "day_themes_mercredi", selector: { text: {} } },
        { name: "day_themes_jeudi", selector: { text: {} } },
        { name: "day_themes_vendredi", selector: { text: {} } },
        { name: "day_themes_samedi", selector: { text: {} } },
        { name: "day_themes_dimanche", selector: { text: {} } },
        { name: "fridge_ingredients", selector: { text: { multiline: true } } },
      ]},
      // ---- Bouton « Changer de recette » ----
      { type: "expandable", name: "replace_section", title: LIBELLES.replace_section, schema: [
        { name: "replace_enabled", selector: { boolean: {} } },
        { name: "replace_service", selector: { text: {} }, default: "jow.suggest" },
        { name: "replace_criteria", selector: { text: { multiline: true } } },
        { name: "replace_covers", selector: { number: { min: 1, max: 12, mode: "slider" } } },
        { name: "replace_weather", selector: { entity: { domain: ["weather"] } } },
        { name: "replace_ai", selector: { entity: { domain: ["ai_task"] } } },
        { name: "replace_limit", selector: { number: { min: 1, max: 20, mode: "slider" } } },
      ]},
      // ---- Bouton « Planifier la semaine prochaine » ----
      { type: "expandable", name: "plan_next_section", title: LIBELLES.plan_next_section, schema: [
        { name: "plan_next_enabled", selector: { boolean: {} } },
      ]},
      // ---- Boutons d'action prédéfinis ----
      { type: "expandable", name: "actions_section", title: LIBELLES.actions_section, schema: [
        { name: "action_meal_done", selector: { boolean: {} } },
        { name: "action_clear_meal", selector: { boolean: {} } },
        { name: "action_refresh_shopping", selector: { boolean: {} } },
        { name: "action_send_jow", selector: { boolean: {} } },
        { name: "action_copy_meal", selector: { boolean: {} } },
        { name: "action_favoris", selector: { boolean: {} } },
      ]},
      // ---- Entités S0 ----
      { type: "expandable", name: "entites", title: LIBELLES.entites,
        schema: JOURS.map((j) => ({ name: j, selector: { entity: { domain: "sensor" } } })) },
      // ---- Entités S+1 ----
      { type: "expandable", name: "entites_s1", title: LIBELLES.entites_s1,
        schema: JOURS.map((j) => ({ name: `s1${j}`, selector: { entity: { domain: "sensor" } } })) },
      // ---- Correspondance des attributs (avancé) ----
      { type: "expandable", name: "attributes_section", title: LIBELLES.attributes_section, schema: [
        { name: "attr_name", selector: { text: {} } },
        { name: "attr_planned", selector: { text: {} } },
        { name: "attr_image", selector: { text: {} } },
        { name: "attr_url", selector: { text: {} } },
        { name: "attr_date", selector: { text: {} } },
        { name: "attr_calories", selector: { text: {} } },
        { name: "attr_allergens", selector: { text: {} } },
        { name: "attr_covers", selector: { text: {} } },
        { name: "attr_duration", selector: { text: {} } },
        { name: "attr_cooking_time", selector: { text: {} } },
        { name: "attr_ingredients", selector: { text: {} } },
      ]},
    ];
  }

  _donnees() {
    const ent = this._entitesCourantes();
    const entS1 = {};
    const entitiesS1 = this._config.entities_s1 || {};
    for (const j of JOURS) {
      entS1[`s1${j}`] = entitiesS1[j] || `${ent[j]}_s1`;
    }
    const ra = this._config.replace_action;
    const attrs = this._config.attributes || {};
    return {
      title: this._config.title || "",
      days: String(this._config.days ?? 7),
      show_calories: this._config.show_calories !== false,
      show_allergens: this._config.show_allergens !== false,
      show_week_calories: this._config.show_week_calories === true,
      show_month: this._config.show_month === true,
      context_section: {
        day_themes_lundi: this._config.day_themes?.lundi || "",
        day_themes_mardi: this._config.day_themes?.mardi || "",
        day_themes_mercredi: this._config.day_themes?.mercredi || "",
        day_themes_jeudi: this._config.day_themes?.jeudi || "",
        day_themes_vendredi: this._config.day_themes?.vendredi || "",
        day_themes_samedi: this._config.day_themes?.samedi || "",
        day_themes_dimanche: this._config.day_themes?.dimanche || "",
        fridge_ingredients: this._config.fridge_ingredients || "",
      },
      replace_section: {
        replace_enabled: !!ra,
        replace_service: ra?.service || "jow.suggest",
        replace_criteria: ra?.data?.criteria || "",
        replace_covers: ra?.data?.covers || 2,
        replace_weather: ra?.data?.weather_entity || "",
        replace_ai: ra?.data?.ai_entity || "",
        replace_limit: ra?.data?.limit || 5,
      },
      plan_next_section: {
        plan_next_enabled: this._config.plan_next_enabled !== false,
      },
      actions_section: {
        action_meal_done: (this._config.actions || {}).meal_done !== false,
        action_clear_meal: (this._config.actions || {}).clear_meal !== false,
        action_refresh_shopping: (this._config.actions || {}).refresh_shopping === true,
        action_send_jow: (this._config.actions || {}).send_jow === true,
        action_copy_meal: (this._config.actions || {}).copy_meal === true,
        action_favoris: (this._config.actions || {}).favoris === true,
      },
      entites: ent,
      entites_s1: entS1,
      attributes_section: {
        attr_name: attrs.name ?? CHAMPS.name ?? "",
        attr_planned: attrs.planned ?? CHAMPS.planned ?? "",
        attr_image: attrs.image ?? CHAMPS.image ?? "",
        attr_url: attrs.url ?? CHAMPS.url ?? "",
        attr_date: attrs.date ?? CHAMPS.date ?? "",
        attr_calories: attrs.calories ?? CHAMPS.calories ?? "",
        attr_allergens: attrs.allergens ?? CHAMPS.allergens ?? "",
        attr_covers: attrs.covers ?? CHAMPS.covers ?? "",
        attr_duration: attrs.duration ?? CHAMPS.duration ?? "",
        attr_cooking_time: attrs.cooking_time ?? CHAMPS.cooking_time ?? "",
        attr_ingredients: attrs.ingredients ?? CHAMPS.ingredients ?? "",
      },
    };
  }

  _rendreHaForm() {
    if (!this._form) {
      this.shadowRoot.innerHTML = "";
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => LIBELLES[s.name] || s.name;
      this._form.addEventListener("value-changed", (e) => {
        const v = { ...e.detail.value };
        // Entités S0 : merge avec les existantes
        const entitesGroupe = v.entites || {};
        const existantes = this._entitesCourantes();
        const entities = JOURS.map((j) => entitesGroupe[j] || existantes[j]).filter(Boolean);
        delete v.entites;

        // Entités S+1 : merge avec les existantes (auto-déduit si vide)
        const entitesS1Groupe = v.entites_s1 || {};
        const entitiesS1 = {};
        for (const j of JOURS) {
          entitiesS1[j] = entitesS1Groupe[`s1${j}`] || "";
        }
        delete v.entites_s1;

        // Sections expandable
        const replaceData = v.replace_section || {};
        const planNextData = v.plan_next_section || {};
        const actionsData = v.actions_section || {};
        const attrData = v.attributes_section || {};
        const ctxData = v.context_section || {};
        delete v.replace_section;
        delete v.plan_next_section;
        delete v.actions_section;
        delete v.attributes_section;
        delete v.context_section;

        const action = this._fabriquerAction(replaceData);
        const attributes = this._fabriquerAttributes(attrData);
        const actions = {
          meal_done: actionsData.action_meal_done !== false,
          clear_meal: actionsData.action_clear_meal !== false,
          refresh_shopping: actionsData.action_refresh_shopping === true,
          send_jow: actionsData.action_send_jow === true,
          copy_meal: actionsData.action_copy_meal === true,
          favoris: actionsData.action_favoris === true,
        };

        // Thèmes par jour + frigo
        const day_themes = {};
        for (const j of JOURS) {
          const val = ctxData[`day_themes_${j}`];
          if (val) day_themes[j] = val;
        }
        const fridge_ingredients = ctxData.fridge_ingredients || "";

        this._emettre({
          type: this._config.type,
          ...v,
          days: Number(v.days) === 1 ? 1 : 7,
          ...(action ? { replace_action: action } : { replace_action: null }),
          ...(planNextData.plan_next_enabled === false ? { plan_next_enabled: false } : {}),
          ...(entities.length === 7 ? { entities } : {}),
          ...(Object.keys(entitiesS1).some((j) => entitiesS1[j]) ? { entities_s1: entitiesS1 } : {}),
          ...(attributes ? { attributes } : {}),
          ...(Object.keys(day_themes).length ? { day_themes } : {}),
          ...(fridge_ingredients ? { fridge_ingredients } : {}),
          actions,
        });
      });
      this.shadowRoot.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = this._schema();
    this._form.data = this._donnees();
  }

  _rendreSimple() {
    const ent = this._entitesCourantes();
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.85rem; }
        label { display: block; margin-bottom: 13px; }
        .lib { display: block; margin-bottom: 4px; opacity: 0.75; }
        input[type=text], select {
          width: 100%; box-sizing: border-box; padding: 8px 10px; font: inherit;
          border: 1px solid rgba(128,128,128,.4); border-radius: 7px;
          background: transparent; color: inherit;
        }
        .case { display: flex; align-items: center; gap: 9px; margin-bottom: 11px; }
        fieldset { border: 1px solid rgba(128,128,128,.3); border-radius: 9px; padding: 13px; }
        legend { padding: 0 6px; opacity: 0.75; }
      </style>
      <label><span class="lib">${LIBELLES.title}</span>
        <input type="text" data-cle="title" value="${this._esc(this._config.title || "")}"></label>
      <label><span class="lib">${LIBELLES.days}</span>
        <select data-cle="days">
          <option value="7"${this._config.days !== 1 ? " selected" : ""}>Semaine entière — détail + index</option>
          <option value="1"${this._config.days === 1 ? " selected" : ""}>Un seul plat, avec flèches</option>
        </select></label>
      <div class="case"><input type="checkbox" id="jc1" data-cle="show_calories"${this._config.show_calories !== false ? " checked" : ""}>
        <label for="jc1">${LIBELLES.show_calories}</label></div>
      <div class="case"><input type="checkbox" id="jc2" data-cle="show_allergens"${this._config.show_allergens !== false ? " checked" : ""}>
        <label for="jc2">${LIBELLES.show_allergens}</label></div>
      <fieldset><legend>${LIBELLES.replace_section}</legend>
        <div class="case"><input type="checkbox" id="jc3" data-cle="replace_enabled"${this._config.replace_action ? " checked" : ""}>
          <label for="jc3">${LIBELLES.replace_enabled}</label></div>
        <label><span class="lib">${LIBELLES.replace_service}</span>
          <input type="text" data-cle="replace_service" placeholder="jow.suggest" value="${this._esc(this._config.replace_action?.service || "jow.suggest")}"></label>
        <label><span class="lib">${LIBELLES.replace_criteria}</span>
          <textarea data-cle="replace_criteria" rows="2" placeholder="${LIBELLES.replace_criteria_help}" style="width:100%;box-sizing:border-box;padding:8px 10px;font:inherit;border:1px solid rgba(128,128,128,.4);border-radius:7px;background:transparent;color:inherit;resize:vertical">${this._esc(this._config.replace_action?.data?.criteria || "")}</textarea></label>
        <label><span class="lib">${LIBELLES.replace_covers}</span>
          <input type="number" data-cle="replace_covers" min="1" max="12" value="${this._config.replace_action?.data?.covers || 2}"></label>
        <label><span class="lib">${LIBELLES.replace_weather}</span>
          <input type="text" data-cle="replace_weather" placeholder="weather.gagny" value="${this._esc(this._config.replace_action?.data?.weather_entity || "")}"></label>
        <label><span class="lib">${LIBELLES.replace_ai}</span>
          <input type="text" data-cle="replace_ai" placeholder="ai_task.ollama_ai_task" value="${this._esc(this._config.replace_action?.data?.ai_entity || "")}"></label>
      </fieldset>
      <fieldset><legend>${LIBELLES.entites}</legend>
        ${JOURS.map((j) => `<label><span class="lib">${cap(j)}</span>
          <input type="text" data-entite="${j}" value="${this._esc(ent[j])}"></label>`).join("")}
      </fieldset>`;

    this.shadowRoot.querySelectorAll("[data-cle],[data-entite]").forEach((el) => {
      el.addEventListener("change", () => this._collecter());
    });
  }

  _collecter() {
    const R = this.shadowRoot;
    const lire = (cle) => {
      const el = R.querySelector(`[data-cle="${cle}"]`);
      if (!el) return undefined;
      return el.type === "checkbox" ? el.checked : el.value;
    };
    const entities = JOURS
      .map((j) => (R.querySelector(`[data-entite="${j}"]`)?.value || "").trim())
      .filter(Boolean);

    const replaceEnabled = lire("replace_enabled");
    const action = replaceEnabled ? {
      service: lire("replace_service") || "jow.suggest",
      data: {
        criteria: lire("replace_criteria") || "",
        weekday: "{weekday}",
        covers: Number(lire("replace_covers")) || 2,
        ...(lire("replace_weather") ? { weather_entity: lire("replace_weather") } : {}),
        ...(lire("replace_ai") ? { ai_entity: lire("replace_ai") } : {}),
        limit: 5,
      },
    } : null;

    this._emettre({
      type: this._config.type,
      title: lire("title"),
      days: Number(lire("days")) === 1 ? 1 : 7,
      show_calories: lire("show_calories"),
      show_allergens: lire("show_allergens"),
      ...(action ? { replace_action: action } : { replace_action: null }),
      ...(entities.length === 7 ? { entities } : {}),
    });
  }

  _esc(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }
}

// Une ressource déclarée deux fois ferait planter define() et empêcherait
// la carte de s'enregistrer du tout.
if (!customElements.get("weekly-menu-card")) {
  customElements.define("weekly-menu-card", WeeklyMenuCard);
}
if (!customElements.get("weekly-menu-card-editor")) {
  customElements.define("weekly-menu-card-editor", WeeklyMenuCardEditor);
}
// Alias : les tableaux de bord configurés avant le renommage continuent
// de fonctionner sans modification.
if (!customElements.get("jow-recipe-board")) {
  customElements.define("jow-recipe-board", class extends WeeklyMenuCard {});
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "weekly-menu-card")) {
  window.customCards.push({
    type: "weekly-menu-card",
    name: "Menu de la semaine",
    description: "Le plat du jour en grand, la semaine en index. Compatible avec n'importe quelles entités.",
    preview: true,
  });
}

export {};