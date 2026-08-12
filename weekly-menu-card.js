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
  ingredients: "ingredients",
};

const DEFAUTS = {
  prefix: "sensor.jow_",
  days: 7,
  show_calories: true,
  show_allergens: true,
  replace_action: null,    // { service: "domaine.service", data: { … } }
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
    display: flex; flex-wrap: wrap; align-items: center; gap: 14px;
    margin-top: 14px;
    font-size: 0.75rem;
    color: var(--gris);
  }
  .chiffres .kcal { color: var(--papier); }

  .compo { margin-top: 13px; font-size: 0.81rem; line-height: 1.7; color: var(--gris); }
  .compo .q { color: var(--papier); }
  /* Sans photo : la composition passe en colonne, filet à gauche. */
  .sans-photo .compo {
    margin-top: 16px;
    font-size: 0.87rem;
    line-height: 1.8;
    border-left: 1px solid #4A443C;
    padding-left: 16px;
  }

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
    this._imagesKO = new Set();
    this._signature = null;
  }

  static getConfigElement() { return document.createElement("weekly-menu-card-editor"); }

  setConfig(config) {
    this._config = { ...DEFAUTS, ...config };
    this._config.days = Number(this._config.days) === 1 ? 1 : 7;
    this._champs = { ...CHAMPS, ...(config.attributes || {}) };
    this._entites = this._config.entities || JOURS.map((j) => `${this._config.prefix}${j}`);
    if (this._entites.length !== 7) {
      throw new Error("weekly-menu-card : il faut exactement 7 entités, de lundi à dimanche.");
    }
    this._signature = null;
    this._occupe = false;
  }

  get hass() { return this._hass; }

  set hass(hass) {
    this._hass = hass;
    const sig = this._entites
      .map((id) => {
        const s = hass.states[id];
        return s ? `${s.state}:${s.last_updated}` : "absent";
      })
      .join("|") + `|${this._selection}|${this._occupe}|${[...this._imagesKO].join(",")}`;
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
  static getStubConfig() { return { type: "custom:jow-recipe-board" }; }

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

  _render() {
    if (!this._hass || !this._config) return;

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
        ${vedette == null ? `
          <p class="vide-total">${this._entites.some((id) => this._hass.states[id])
            ? "Aucun repas planifié cette semaine."
            : "Aucune des entités configurées n'existe. Vérifiez la configuration de la carte."}</p>`
          : this._vueDetail(jours[vedette], planifies.length)}
        ${unSeulJour ? "" : this._index(jours, vedette)}
        ${this._config.show_allergens && codesPied.length ? `
          <p class="legende">
            ${codesPied.map((c) => this._esc(c.code ? `${c.code} ${c.label}` : c.label)).join(" · ")}${
              estimes ? " — déduits des ingrédients, à vérifier en cas d'allergie" : ""}
          </p>` : ""}
      </div>`;

    this._brancher();
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
      chiffres.push(j.calories != null
        ? `<span class="mono kcal">${j.calories} kcal</span>`
        : `<span class="mono">kcal non renseignées</span>`);
    }
    if (j.preparation) chiffres.push(`<span class="mono">${j.preparation} min</span>`);
    if (j.couverts) chiffres.push(`<span class="mono">${j.couverts} couvert${j.couverts > 1 ? "s" : ""}</span>`);

    // Avec photo : une ligne à puces, compacte. Sans : une colonne qui respire.
    const items = j.ingredients.map((i) => {
      const q = i.quantity ? `<span class="mono q">${this._esc(i.quantity)}${i.unit ? " " + this._esc(i.unit) : ""}</span> ` : "";
      return `${q}${this._esc(i.name)}`;
    });
    const compo = items.length
      ? `<p class="compo">${sansPhoto ? items.join("<br>") : items.join(" · ")}</p>`
      : `<p class="compo">Ingrédients non renseignés.</p>`;

    const all = j.allergenes.length
      ? `Allergènes · ${j.allergenes.map((c) => (c.code ? `${c.code} ${c.label}` : c.label)).join(" · ")}`
      : "Sans allergène signalé";

    return `
      ${photo ? `<img class="photo" src="${photo}" alt="" data-photo="${j.index}">` : ""}
      <div class="detail${sansPhoto ? " sans-photo" : ""}">
        <p class="surtitre mono"><span>${this._esc(surtitre)}</span>${nav}</p>
        <h1 class="titre" tabindex="-1">${this._esc(j.nom)}</h1>
        <div class="chiffres">${chiffres.join("")}</div>
        ${compo}
        <div class="actions">
          ${lien ? `<a class="bouton" href="${lien}" target="_blank" rel="noopener noreferrer">Voir la recette ↗</a>` : ""}
          ${this._config.show_allergens ? `<span class="allergenes mono">${this._esc(all)}</span>` : ""}
        </div>
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
          ? `<button class="ligne" data-remplacer="${j.index}"${this._occupe ? " disabled" : ""}>
               <span class="jour mono">${COURTS[j.index]}</span>
               <span class="nom vide">${this._occupe ? "En cours\u2026" : "Rien de prévu \u2014 en proposer un"}</span>
               <span class="fleche">+</span></button>`
          : `<div class="ligne inerte">
               <span class="jour mono">${COURTS[j.index]}</span>
               <span class="nom vide">Rien de prévu</span>
               <span class="fleche">+</span></div>`;
      }
      const codes = this._config.show_allergens && j.allergenes.length
        ? `<span class="codes mono">allergènes ${this._esc(j.allergenes.map((c) => c.code || c.label).join(" · "))}</span>` : "";
      const kcal = this._config.show_calories && j.calories != null
        ? `<span class="kcal-index mono">${j.calories}<i> kcal</i></span>` : "";
      return `<button class="ligne" data-jour="${j.index}">
        <span class="jour mono">${COURTS[j.index]}</span>
        <span class="nom">${this._esc(j.nom)}${codes}</span>
        ${kcal}
        <span class="fleche">›</span>
      </button>`;
    }).join("")}</div>`;
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

    this._occupe = true;
    this._signature = null;
    this._render();
    try {
      await this._hass.callService(action.domaine, action.service, data);
    } catch (err) {
      console.error(`weekly-menu-card : échec de ${action.domaine}.${action.service}`, err);
    } finally {
      this._occupe = false;
      this._signature = null;
      this._render();
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
  title: "Titre (facultatif)",
  days: "Affichage",
  show_calories: "Afficher les calories",
  show_allergens: "Afficher les allergènes",
  replace_service: "Service du bouton « Changer le plat »",
  replace_query: "Recherche à transmettre",
  replace_label: "Libellé du bouton",
  entites: "Entités, jour par jour",
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

  /** Assemble replace_action à partir des trois champs de l'éditeur.
   *  Le jeton {date} évite que la carte connaisse la signature du service. */
  _fabriquerAction(service, query) {
    if (!service || !service.includes(".")) return null;
    return {
      service,
      data: {
        ...(query ? { query } : {}),
        date: "{date}",
        ...(service === "jow.plan_meal" ? { choice: 1 } : {}),
      },
    };
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
      { name: "title", selector: { text: {} } },
      { name: "days", selector: { select: { mode: "dropdown", options: [
        { value: "7", label: "Semaine entière — détail + index" },
        { value: "1", label: "Un seul plat, avec flèches" },
      ] } } },
      { name: "show_calories", selector: { boolean: {} } },
      { name: "show_allergens", selector: { boolean: {} } },
      { name: "replace_service", selector: { text: {} } },
      { name: "replace_query", selector: { text: {} } },
      { name: "replace_label", selector: { text: {} } },
      { type: "expandable", name: "entites", title: LIBELLES.entites,
        schema: JOURS.map((j) => ({ name: j, selector: { entity: { domain: "sensor" } } })) },
    ];
  }

  _donnees() {
    return {
      title: this._config.title || "",
      days: String(this._config.days ?? 7),
      show_calories: this._config.show_calories !== false,
      show_allergens: this._config.show_allergens !== false,
      replace_service: this._config.replace_action?.service || "",
      replace_query: this._config.replace_action?.data?.query || "",
      replace_label: this._config.replace_label || "",
      ...this._entitesCourantes(),
    };
  }

  _rendreHaForm() {
    if (!this._form) {
      this.shadowRoot.innerHTML = "";
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => LIBELLES[s.name] || s.name;
      this._form.addEventListener("value-changed", (e) => {
        const v = { ...e.detail.value };
        const entities = JOURS.map((j) => v[j]).filter(Boolean);
        JOURS.forEach((j) => delete v[j]);
        const action = this._fabriquerAction(v.replace_service, v.replace_query);
        delete v.replace_service;
        delete v.replace_query;
        this._emettre({
          type: this._config.type,
          ...v,
          days: Number(v.days) === 1 ? 1 : 7,
          ...(action ? { replace_action: action } : { replace_action: null }),
          ...(entities.length === 7 ? { entities } : {}),
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
      <label><span class="lib">${LIBELLES.replace_service}</span>
        <input type="text" data-cle="replace_service" placeholder="ex. jow.plan_meal — laisser vide pour masquer le bouton" value="${this._esc(this._config.replace_action?.service || "")}"></label>
      <label><span class="lib">${LIBELLES.replace_query}</span>
        <input type="text" data-cle="replace_query" placeholder="ex. poulet léger" value="${this._esc(this._config.replace_action?.data?.query || "")}"></label>
      <label><span class="lib">${LIBELLES.replace_label}</span>
        <input type="text" data-cle="replace_label" placeholder="Changer le plat" value="${this._esc(this._config.replace_label || "")}"></label>
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
    this._emettre({
      type: this._config.type,
      title: lire("title"),
      days: Number(lire("days")) === 1 ? 1 : 7,
      show_calories: lire("show_calories"),
      show_allergens: lire("show_allergens"),

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