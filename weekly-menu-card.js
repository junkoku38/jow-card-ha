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

const CARD_VERSION = "2.4.1";

console.info(
  `%c WEEKLY-MENU-CARD %c v${CARD_VERSION} `,
  "color:#F2EFE9;background:#1A1816;font-weight:700;padding:2px 4px;border-radius:3px 0 0 3px",
  "color:#1A1816;background:#F2EFE9;padding:2px 4px;border-radius:0 3px 3px 0"
);

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
  // Vue panier & santé (v2.0) : bloc sous la semaine affichant
  // sensor.jow_plats_dans_jow (repli panier_jow) / jow_synchro / jow_compte
  // bouton « Préparer la commande » (jow.order_cart). Lecture seule
  // ici — le paiement reste sur jow.fr ou via le service jow.order_pay.
  show_cart: false,
  // Instance Jow à cibler en multi-instance (param entry_name des services
  // jow.*) ; vide = instance par défaut.
  entry_name: "",
  replace_action: null,    // { service: "domaine.service", data: { … } }
  replace_ai_prompt: "",   // Prompt IA personnalisé (remplace le prompt par défaut)
  // Thèmes par jour : injectés dans le criteria de l'IA
  // ex: { "lundi": "végétarien", "mardi": "poisson", "vendredi": "plaisir" }
  day_themes: {},
  // Ingrédients disponibles (inventaire du frigo) : injectés dans le criteria
  // ex: "poulet, courgettes, tomates"
  fridge_ingredients: "",
  // Presets de critères applicables à des jours précis. Chaque preset
  // définit un criteria et/ou des contraintes quantitatives (max_calories,
  // max_total_time en minutes) envoyées au service jow.suggest pour le
  // CHOIX AUTOMATIQUE et le bouton « Changer de recette » de ces jours —
  // jamais pour la barre « Proposer un plat » (prompt libre = précision).
  // ex:
  //   criteria_presets:
  //     - name: Léger
  //       criteria: plat léger et équilibré
  //       max_calories: 600
  //       days: [lundi, mercredi, vendredi]
  //     - name: Rapide
  //       criteria: recette simple
  //       max_total_time: 25
  //       days: [mardi, jeudi]
  criteria_presets: [],
  // Boutons d'action prédéfinis (activés par défaut, configurables)
  actions: {
    meal_done: true,        // Marquer le repas comme fait
    clear_meal: true,       // Effacer le repas du jour
    refresh_shopping: false,// Régénérer la liste de courses
    copy_meal: false,       // Copier vers un autre jour (restes) — optionnel
    send_jow: false,        // Envoyer à Jow — optionnel (tabs) ou jow.send_menu (service)
    favoris: false,         // Choisir parmi les favoris
    collections: false,    // Importer une collection dans la semaine
    rescue: false,          // Sauver les ingrédients qui expirent (suggest rescue)
    import_jow: false,      // Importer le menu depuis jow.fr/l'app (jow.import_menu)
    export_week: true,       // Exporter la semaine vers une collection jow.fr
    clear_week: false,      // Vider la semaine (rejets mémorisés)
    renew_week: false,      // Renouveler la semaine (vider + replan IA)
    send_jow_mode: "tabs",  // "tabs" = ouvrir jow.fr, "service" = jow.send_menu (avec dates)
  },
};

/* Définition des boutons d'action prédéfinis.
   Chaque bouton appelle un service sur le jour actuellement affiché.
   Toutes les actions sont surchargeables via la config de la carte :
   actions:
     meal_done: true
     meal_done_service: script.manger  # (optionnel, remplace jow.meal_done)
   Un service personnalisé reçoit {weekday} interpolé dans data. */
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
    // week_offset est injecté dynamiquement selon la semaine affichée
    data: { keep_checked: true },
    confirm: null,
  },
  send_jow: {
    label: "Envoyer à Jow",
    icon: "🛒",
    // Deux comportements : le service jow.send_menu (avec dates, v0.11.0)
    // si activé via send_jow_mode: "service", sinon l'ouverture d'onglets
    // jow.fr historique (data-envoyer-jow géré à part).
    service: null,
    data: null,
    confirm: null,
  },
  import_jow: {
    label: "Importer depuis Jow",
    icon: "⇄",
    // Synchro Jow → HA : les plats ajoutés sur jow.fr/l'app atterrissent
    // sur les jours vides du planning (jamais d'écrasement).
    service: "jow.import_menu",
    data: {},
    confirm: null,
  },
  clear_week: {
    label: "Vider la semaine",
    icon: "🗑",
    // Efface les 7 repas de la semaine affichée ; les plats nourrissent
    // la mémoire des rejets (plus reproposés 60 jours).
    service: "jow.clear_week",
    data: {},
    confirm: "Vider les 7 repas de la semaine affichée ? Les plats seront mémorisés comme refusés (non reproposés pendant 60 jours).",
  },
  renew_week: {
    label: "Renouveler la semaine",
    icon: "🎲",
    // Vide (rejets mémorisés) puis replanifie la semaine entière via
    // le pipeline IA (jow.renew_week, intégration ≥ 0.12.0).
    service: "jow.renew_week",
    data: {},
    confirm: "Renouveler toute la semaine ? Les 7 plats actuels seront remplacés par de nouvelles suggestions IA.",
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
  collections: {
    label: "Importer une collection",
    icon: "📚",
    service: "jow.collections_list",
    data: {},
    confirm: null,
  },
  rescue: {
    label: "Sauver les ingrédients qui expirent",
    icon: "⏰",
    // suggest avec rescue_expiry : l'IA reçoit les périssables du planning
    // qui expirent sous 3 jours et doit générer une recette qui les écoule.
    service: "jow.suggest",
    data: { weekday: "{weekday}" },
    confirm: null,
  },
};

/** Résout le service d'une action prédéfinie : surcharge config si
 *  présente (actions.<clé>_service), défaut jow sinon. Retourne
 *  null pour les actions sans service (ex: send_jow, gérées à part). */
function _serviceAction(config, cle) {
  const def = ACTIONS_PREDEFINIES[cle];
  if (!def) return null;
  const surcharge = (config?.actions || {})[`${cle}_service`];
  if (typeof surcharge === "string" && surcharge.trim()) {
    const [domaine, service] = surcharge.trim().split(".");
    return { domaine, service, data: def.data, confirm: def.confirm };
  }
  if (!def.service) return null;
  const [domaine, service] = def.service.split(".");
  return { domaine, service, data: def.data, confirm: def.confirm };
}

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
    position: relative; /* ancre le toast absolute */
    background: var(--encre);
    color: var(--papier);
    border-radius: 14px;
    overflow: hidden;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  /* Les marges par défaut du navigateur sur p/h1 s'additionnent aux nôtres
     et doublent les espacements. On repart de zéro. */
  .carte p, .carte h1, .carte h2 { margin: 0; }
  .mono { font-family: ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace; }
  .titre-carte {
    padding: 16px 22px 0;
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

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
  button.mois-jour { width: 100%; background: none; border: 0; color: inherit; font: inherit; text-align: left; }
  button.mois-jour:hover .plat { color: #FFF; }
  button.mois-jour:focus-visible { outline: 2px solid var(--papier); outline-offset: -2px; border-radius: 4px; }
  .mois-jour:hover { opacity: 0.7; }
  .mois-jour .court { color: var(--gris); width: 12px; font-size: 0.62rem; }
  .mois-jour .plat { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mois-jour .plat.vide { color: var(--gris); font-style: italic; }
  .toast {
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: var(--encre); color: var(--papier); padding: 10px 20px;
    border: 1px solid var(--filet);
    border-radius: 8px; font-size: 0.85rem; z-index: 9999;
    max-width: calc(100% - 44px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
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
  /* Boutons de synchro Jow (en-tête) : accent visuel discret pour les
     distinguer des bascules S/S+1. */
  .semaine-bascule .sync-btn { opacity: 0.85; margin-right: 4px; }
  .semaine-bascule .sync-btn:hover { border-color: var(--accent, #d8a25a); opacity: 1; }
  .panier-sante { margin: 10px 22px 4px; padding: 10px 14px; border: 1px solid var(--filet); border-radius: 10px; font-size: 0.82rem; }
  .panier-sante .ps-row { display: flex; justify-content: space-between; padding: 3px 0; }
  .panier-sante .ps-ok { color: #4a9; }
  .panier-sante .ps-ko { color: #d86a5a; }
  .panier-sante .bouton { width: 100%; margin-top: 8px; }
  .semaine-bascule .sync-btn.danger:hover { border-color: #d86a5a; }
  .info-btn { border: none; background: none; color: var(--gris); font-size: 0.8rem; cursor: pointer; opacity: 0.5; }
  .info-btn:hover { opacity: 1; }
  .info-popup {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    background: var(--encre); color: var(--papier); border-radius: 12px;
    padding: 24px; max-width: 500px; max-height: 80vh; overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4); z-index: 10000;
    font-size: 0.82rem; line-height: 1.5;
  }
  .info-popup h3 { margin: 0 0 12px; font-size: 1rem; }
  .info-popup .info-section { margin-bottom: 14px; }
  .info-popup .info-section h4 { margin: 0 0 4px; font-size: 0.78rem; color: var(--gris); text-transform: uppercase; }
  .info-popup .info-section p { margin: 0; }
  .info-popup .info-section ul { margin: 4px 0; padding-left: 18px; }
  .info-popup .info-close { position: absolute; top: 12px; right: 16px; cursor: pointer; font-size: 1.2rem; opacity: 0.6; }
  .info-popup .info-close:hover { opacity: 1; }
  .info-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 9999; }

  /* ---- Dialogue modal (remplace window.confirm / prompt) ---- */
  .dialogue-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10001;
    display: flex; align-items: center; justify-content: center;
  }
  .dialogue {
    background: var(--encre); color: var(--papier); border-radius: 12px;
    padding: 24px; max-width: 340px; width: calc(100% - 32px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.4); z-index: 10002;
    font-size: 0.88rem; line-height: 1.5;
  }
  .dialogue-msg { margin: 0 0 18px; }
  .dialogue-boutons { display: flex; gap: 10px; justify-content: flex-end; }
  .dialogue-boutons button {
    min-height: 44px; padding: 0 18px;
    border: 1px solid var(--filet); border-radius: 8px;
    background: none; color: var(--papier);
    font: inherit; font-size: 0.85rem; cursor: pointer;
  }
  .dialogue-boutons button:hover { border-color: var(--gris); }
  .dialogue-boutons button:focus-visible { outline: 2px solid var(--papier); outline-offset: 2px; }
  .dialogue-boutons button.danger { border-color: #a33; color: #e88; }
  .dialogue-boutons button.danger:hover { background: #a33; color: var(--papier); }
  .dialogue-select {
    width: 100%; margin-bottom: 18px; padding: 10px 12px;
    border: 1px solid var(--filet); border-radius: 8px;
    background: var(--encre-2); color: var(--papier);
    font: inherit; font-size: 0.85rem; outline: none;
  }
  .dialogue-select:focus { border-color: var(--gris); }

  /* ---- Menu tactile (remplace le drag & drop sur mobile) ---- */
  .menu-tactile {
    position: fixed; z-index: 10002;
    background: var(--encre); border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    padding: 6px; min-width: 200px;
    font-size: 0.82rem;
  }
  .menu-tactile .mt-titre {
    padding: 8px 12px 6px; font-size: 0.62rem; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--gris);
  }
  .menu-tactile button {
    display: block; width: 100%; text-align: left;
    padding: 10px 12px; border: 0; border-radius: 6px;
    background: none; color: var(--papier);
    font: inherit; font-size: 0.82rem; cursor: pointer;
  }
  .menu-tactile button:hover { background: var(--encre-2); }
  .menu-tactile button:disabled { opacity: 0.4; cursor: default; }
  .menu-tactile button.danger { color: #e88; }

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
    // Merge profond pour les sous-objets (actions, day_themes) : une config
    // partielle ne doit pas effacer les défauts des autres clés.
    const fusion = (base, utilisateur) => {
      const out = { ...base };
      for (const [k, v] of Object.entries(utilisateur || {})) {
        out[k] = v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object"
          ? fusion(base[k], v)
          : v;
      }
      return out;
    };
    this._config = fusion(DEFAUTS, config);
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

  /* set hass : une signature (état + last_updated + couverts + quantités
     d'ingrédients + contexte UI) évite tout re-rendu superflu — HA pousse
     un nouvel objet hass à chaque événement du bus, y compris ceux qui ne
     concernent pas cette carte. En cas de changement réel, on reconstruit
     le DOM de la carte : simple et sûr (pas de reconciliation partielle
     à maintenir), le volume DOM reste modeste (~une centaine de noeuds). */
  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    // Nettoyer _imagesKO : si une entité a changé (last_updated), on
    // retire son index du Set pour que la nouvelle image puisse s'afficher.
    for (let i = 0; i < this._entites.length; i++) {
      const s = hass.states[this._entites[i]];
      if (!s) continue;
      const prev = oldHass?.states?.[this._entites[i]];
      if (prev && prev.last_updated !== s.last_updated && this._imagesKO.has(i)) {
        this._imagesKO.delete(i);
      }
    }
    const sig = this._entites
      .map((id) => {
        const s = hass.states[id];
        if (!s) return "absent";
        const a = s.attributes || {};
        // Inclure covers, calories et un hash des quantites d'ingredients
        // pour detecter set_covers (qui ne change pas le state ni last_updated)
        const covers = a.covers || "";
        const ings = a.ingredients || [];
        const ingQty = ings.map((i) => `${i.quantity ?? ""}`).join(",");
        return `${s.state}:${s.last_updated}:${covers}:${ingQty}`;
      })
      .join("|") + `|${this._weekOffset}|${this._selection}|${this._occupe}|${[...this._imagesKO].join(",")}`;
    /* Vue mensuelle : suivre aussi les semaines dérivées (S-1, S+2),
       sinon un changement sur ces entités ne redessine pas la grille. */
    let sigMois = "";
    if (this._config?.show_month) {
      for (const off of [-1, 0, 1, 2]) {
        const ids = this._entitesPourOffset(off);
        if (!ids) continue;
        sigMois += "|" + ids.map((id) => hass.states[id]?.state ?? "absent").join(";");
      }
    }
    if (sig + sigMois === this._signature) return;
    this._signature = sig + sigMois;
    this._render();
  }

  getCardSize() {
    // Une semaine vide n'occupe pas la place d'une semaine remplie.
    if (!this._hass) return 11;
    if (this._config?.days === 1) return 7;
    const prevus = JOURS.filter((_, i) => this._jour(i).planned).length;
    return prevus ? 6 + Math.min(prevus, 6) : 3;
  }

  /* Dashboards modernes (sections) : la carte remplira sa colonne. */
  getGridOptions() {
    const rows = this._hass
      ? Math.max(3, Math.ceil((JOURS.filter((_, i) => this._jour(i).planned).length || 1) / 2) + 3)
      : 6;
    return { columns: 12, min_rows: 3, max_rows: rows };
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
    // Respecter la correspondance d'attributs configurée (attributes) —
    // pas de fallback en dur qui court-circuiterait un remappage.
    const cuisson = this._champ(a, "cooking_time") || null;

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
    return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /** Échapper le HTML ne suffit pas dans un href : « javascript: » passerait.
   *  On n'accepte que http(s), et les data: d'image pour les vignettes. */
  _url(brut, imageAutorisee = false) {
    if (!brut) return null;
    const t = String(brut).trim();
    if (/^https?:\/\//i.test(t)) return this._esc(t);
    if (imageAutorisee && /^data:image\/(png|jpe?g|webp|gif)(;base64)?,/i.test(t)) return this._esc(t);
    return null;
  }

  _dateLisible(iso) {
    if (!iso) return "";
    return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  }

  /** Entités dérivées pour un offset de semaine donné, ou null si
   *  l'intégration ne fournit pas ces entités (S-1, S+2…). */
  _entitesPourOffset(offset) {
    if (offset === 0) return this._entitesBase;
    if (offset === 1) return this._entites; // respecte entities_s1 configuré
    // Autres semaines : suffixe _s{offset} — colonne affichée seulement
    // si au moins une de ces entités existe dans HA.
    const derivees = this._entitesBase.map((id) =>
      id.endsWith(`_s${offset}`) ? id : `${id}_s${offset}`
    );
    const existe = derivees.some((id) => this._hass?.states[id]);
    return existe ? derivees : null;
  }

  /** Le plat d'un jour est-il planifié ? Même logique que _jour :
   *  attribut configuré sinon déduction depuis l'état, normalisé. */
  _estPlanifie(etat) {
    if (!etat) return false;
    const a = etat.attributes || {};
    const drapeau = this._champ(a, "planned");
    if (typeof drapeau === "boolean") return drapeau;
    const nom = this._champs.name ? a[this._champs.name] : etat.state;
    return !!nom && !ETATS_VIDES.includes(String(nom).trim().toLowerCase());
  }

  /** Vue mensuelle compacte : les semaines qui existent réellement
   *  (S et S+1 toujours ; S-1, S+2 si leurs entités existent). */
  _vueMensuelle() {
    const labels = { "-1": "Sem. dernière", 0: "Cette semaine", 1: "S+1", 2: "S+2" };
    const cellules = [-1, 0, 1, 2]
      .map((offset) => {
        const ids = this._entitesPourOffset(offset);
        if (!ids) return ""; // colonne fantôme : entités inexistantes
        const jours = ids.map((id, i) => {
          const s = this._hass.states[id];
          const planned = this._estPlanifie(s);
          const nom = planned
            ? String(this._champs.name ? s.attributes?.[this._champs.name] : s.state)
            : "";
          return { index: i, planned, nom, offset, existe: !!s };
        });
        const lignes = jours.map((j) => {
          if (j.planned) {
            return `<button class="mois-jour" data-mois-jour="${j.index}" data-mois-offset="${offset}">
              <span class="court mono">${COURTS[j.index]}</span>
              <span class="plat">${this._esc(j.nom)}</span>
            </button>`;
          }
          return `<div class="mois-jour">
            <span class="court mono">${COURTS[j.index]}</span>
            <span class="plat vide">—</span>
          </div>`;
        }).join("");
        return `<div class="mois-semaine"><div class="titre-s">${labels[offset] ?? `S${offset > 0 ? "+" : ""}${offset}`}</div>${lignes}</div>`;
      })
      .join("");
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
      this._restaurerToast();
    this._brancher();
      return;
    }

    const jours = JOURS.map((_, i) => this._jour(i));
    const vedette = this._indexAffiche(jours);
    const planifies = jours.filter((j) => j.planned);
    // Actions au niveau CARTE (synchro Jow) : lues ici pour l'en-tête.
    const actionsCfg = this._config.actions || {};

    const unSeulJour = this._config.days === 1;
    const estimes = planifies.some((j) => j.estimes);
    // En mode un seul jour, la légende ne concerne que le plat affiché.
    const source = unSeulJour && vedette != null ? jours[vedette].allergenes : planifies.flatMap((j) => j.allergenes);
    const codesPied = [...new Map(source.map((x) => [x.label, x])).values()]
      .sort((a, b) => (a.code ?? 99) - (b.code ?? 99) || a.label.localeCompare(b.label));

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="carte">
        ${this._config.title ? `<h2 class="titre-carte">${this._esc(this._config.title)}</h2>` : ""}
        <div class="semaine-bascule">
          <span>${this._weekOffset === 0 ? "Cette semaine" : "Semaine prochaine"}</span>
          <span>
            ${actionsCfg.import_jow ? `<button data-import-jow="1" class="sync-btn" title="Importer le menu depuis jow.fr / l'app (jours vides seulement)" aria-label="Importer le menu depuis Jow"${this._occupe ? " disabled" : ""}>⇄ Jow</button>` : ""}
            ${actionsCfg.send_jow ? (() => { const mode = this._sendJowMode(); return `<button data-envoyer-jow="1" class="sync-btn" title="${mode === "service" ? "Envoyer le planning au compte Jow (avec dates)" : "Ouvrir les recettes sur jow.fr"}" aria-label="Envoyer à Jow"${this._occupe ? " disabled" : ""}>${mode === "service" ? "🛒 Envoyer" : "🛒 Jow"}</button>`; })() : ""}
            ${actionsCfg.export_week ? `<button data-export-week="1" class="sync-btn" title="Livre cette semaine dans une collection jow.fr (Semaine N) — réimportable dans l'app jow pour la liste d'achat" aria-label="Exporter la semaine vers jow.fr"${this._occupe ? " disabled" : ""}>📤 Exporter</button>` : ""}
            ${actionsCfg.collections ? `<button data-coll-open="1" class="sync-btn" title="Importer une collection jow.fr sur les jours vides de la semaine affichée" aria-label="Importer une collection"${this._occupe ? " disabled" : ""}>📚 Collections</button>` : ""}
            ${actionsCfg.clear_week ? `<button data-action-semaine="clear_week" class="sync-btn danger" title="Vider les 7 repas de la semaine affichée (plats mémorisés comme refusés)" aria-label="Vider la semaine"${this._occupe ? " disabled" : ""}>🗑 Semaine</button>` : ""}
            ${actionsCfg.renew_week ? `<button data-action-semaine="renew_week" class="sync-btn" title="Renouveler toute la semaine : vider + 7 nouvelles suggestions IA" aria-label="Renouveler la semaine"${this._occupe ? " disabled" : ""}>🎲 Renouveler</button>` : ""}
            <button data-semaine="0" aria-label="Semaine en cours" class="${this._weekOffset === 0 ? "actif" : ""}">S</button>
            <button data-semaine="1" aria-label="Semaine prochaine" class="${this._weekOffset === 1 ? "actif" : ""}">S+1</button>
            <button class="info-btn" data-info="1" title="Contexte IA" aria-label="Contexte IA (allergies, préférences, interdits)">ℹ</button>
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
        ${this._vuePanierSante()}
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

    this._restaurerToast();
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
      const q = i.quantity != null && i.quantity !== ""
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

    // Boutons d'action prédéfinis (meal_done, clear_meal, copy_meal,
    // favoris, rescue) — refresh_shopping est déplacé en bas de la carte ;
    // send_jow, import_jow, clear_week et renew_week dans l'en-tête (ils
    // agissent sur la semaine entière, pas sur le jour affiché).
    // Les boutons optionnels (favoris, rescue) n'apparaissent que s'ils
    // sont activés explicitement dans la config.
    const actionsConfig = this._config.actions || {};
    const OPTIONAL_ACTIONS = new Set(["favoris", "rescue", "collections"]);
    const DETAIL_EXCLUS = new Set(["send_jow", "import_jow", "clear_week", "renew_week", "collections"]);
    const boutonsActions = Object.entries(ACTIONS_PREDEFINIES)
      .filter(([key]) => {
        if (key === "refresh_shopping") return false;
        if (DETAIL_EXCLUS.has(key)) return false;
        if (OPTIONAL_ACTIONS.has(key)) return actionsConfig[key] === true;
        return actionsConfig[key] !== false;
      })
      .map(([key, def]) => {
        // Confirmation de l'action résolue (surcharge comprise)
        const act = _serviceAction(this._config, key);
        const confirmText = act?.confirm ?? def.confirm;
        const confirmAttr = confirmText ? ` data-confirm="${this._esc(confirmText)}"` : "";
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
           <span>${j.couverts || 2} couvert${(j.couverts || 2) > 1 ? "s" : ""}</span>
          <button data-covers-plus="${j.index}"${this._occupe ? " disabled" : ""}>+</button>
        </div>
        ${compo}
        ${barreSuggest}
        <div class="actions">
          ${lien ? `<button class="bouton" data-recette="${j.index}">Voir la recette ↗</button>` : ""}
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
          ? `<button class="ligne" data-remplacer="${j.index}" data-drop-jour="${j.index}" aria-label="Proposer un plat pour le ${JOURS[j.index]}"${this._occupe ? " disabled" : ""}>
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
      return `<button class="ligne" data-jour="${j.index}" data-drag-jour="${j.index}" data-drop-jour="${j.index}" draggable="true" aria-label="${this._esc(JOURS[j.index])} : ${this._esc(j.nom)}">
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
  /** Vue panier & santé (v2.0, show_cart) : capteurs d'état de la refonte
   *  + bouton de préparation de commande (lecture seule, sans paiement). */
  /** Préfixe des capteurs d'état : config explicite, sinon auto-détection
   *  (les instances nommées préfixent leurs capteurs : sensor.<nom>_jow_*)
   *  — une édition via l'éditeur visuel écrase la config manuelle, le
   *  fallback évite de perdre le bloc santé à chaque édition. */
  _statePrefix() {
    const conf = this._config.entity_prefix || this._config.prefix;
    if (conf) return conf;
    const states = Object.keys(this._hass?.states || {});
    const hit = states.find((eid) => eid.endsWith("_jow_synchro")) || states.find((eid) => eid.includes("jow_synchro"));
    if (hit) return hit.replace(/jow_synchro$/, "jow_");
    return "sensor.jow_";
  }

  _vuePanierSante() {
    if (!this._config.show_cart || !this._hass) return "";
    const pre = this._statePrefix();
    const synchro = this._hass.states[`${pre}synchro`];
    const compte = this._hass.states[`${pre}compte`];
    // Le nom du capteur v2.0 est « Plats dans Jow » → sensor.jow_plats_dans_jow ;
    // on accepte aussi l'ancien panier_jow au cas où l'utilisateur l'ait renommé.
    const panier = this._hass.states[`${pre}plats_dans_jow`] || this._hass.states[`${pre}panier_jow`];
    if (!synchro && !compte && !panier) return "";
    const rows = [];
    if (synchro) {
      const etat = this._esc(synchro.state);
      const ok = synchro.state === "ok";
      rows.push(`<div class="ps-row"><span>🔔 Synchro</span><span class="${ok ? "ps-ok" : "ps-ko"}">${etat}</span></div>`);
    }
    if (compte) {
      const prefs = compte.attributes && compte.attributes.preferences;
      rows.push(`<div class="ps-row"><span>👤 Compte</span><span>${this._esc(compte.state)}${prefs ? ` · ${this._esc(prefs)}` : ""}</span></div>`);
    }
    if (panier) {
      rows.push(`<div class="ps-row"><span>🛒 Plats dans Jow</span><span>${this._esc(String(panier.state))} ${panier.state === "indisponible" ? "" : "plats"}</span></div>`);
    }
    const bouton = "";  // (retiré : la commande fournisseur se fait sur jow.fr/app)
    return `<div class="panier-sante">
      <p class="compo-titre">Jow · synchro & commande</p>
      ${rows.join("")}
      ${bouton}
    </div>`;
  }

  /** Ouvre le dialogue d'import de collection (bouton en-tête 📚). */
  async _ouvrirCollections() {
        this._occupe = true;
        this._signature = null;
        this._render();
        let collections;
        try {
          const resp = await this._jowCallWS("collections_list");
          const payload = (resp && resp.response) || {};
          collections = payload.collections || [];
        } catch (err) {
          console.error("weekly-menu-card : échec collections_list", err);
          this._toast("✕ Lecture des collections impossible", true);
          this._occupe = false; this._signature = null; this._render();
          return;
        }
        this._occupe = false;
        this._signature = null;
        this._render();
        const customs = collections.filter((c) => c.type !== "favorites" && c.type !== "try-later");
        if (!customs.length) {
          this._toast("Aucune collection — créez-en une avec 📤 Exporter", true);
          return;
        }
        const R = this.shadowRoot;
        if (!R) return;
        const semLabel = this._weekOffset === 0 ? "cette semaine" : "semaine prochaine";
        const items = customs.map((c, idx) => {
          return `<li style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--filet-fin)">
            <span style="flex:1"><b>📚 ${this._esc(c.title || "Collection")}</b><span style="color:var(--gris);font-size:0.8rem"> — ${this._esc(String(c.recettes ?? 0))} recette${(c.recettes ?? 0) > 1 ? "s" : ""}</span></span>
            <button class="bouton" data-coll-import="${idx}" style="padding:6px 12px;cursor:pointer">Importer</button>
          </li>`;
        }).join("");
        const overlay = document.createElement("div");
        overlay.className = "dialogue-overlay";
        overlay.innerHTML = `<div class="dialogue" role="dialog" aria-modal="true" style="max-width:500px;max-height:80vh;overflow-y:auto">
          <p class="dialogue-msg">📚 Mes collections Jow<br><span style="color:var(--gris);font-size:0.8rem">« Importer » planifie les recettes sur les jours vides de la ${this._esc(semLabel)}</span></p>
          <ul style="list-style:none;padding:0;margin:0">${items}</ul>
          <div class="dialogue-boutons"><button data-rep="non">Fermer</button></div>
        </div>`;
        R.appendChild(overlay);
        const fermerOverlay = () => { overlay.remove(); this._signature = null; this._render(); };
        overlay.addEventListener("click", async (e) => {
          if (e.target === overlay) { fermerOverlay(); return; }
          if (e.target.closest('[data-rep="non"]')) { fermerOverlay(); return; }
          const btn = e.target.closest("[data-coll-import]");
          if (!btn) return;
          const c = customs[Number(btn.dataset.collImport)];
          btn.disabled = true;
          btn.textContent = "…";
          try {
            const resp = await this._jowCallWS("collection_import", {
              collection_id: String(c.id),
              week_offset: this._weekOffset,
            });
            const r = (resp && resp.response) || {};
            if (r.error) {
              this._toast(`✕ Import refusé : ${this._esc(String(r.error))}`, true);
            } else {
              const imp = r.imported ?? 0;
              const skp = r.skipped ?? 0;
              this._toast(imp > 0
                ? `✓ ${imp} plat${imp > 1 ? "s" : ""} importé${imp > 1 ? "s" : ""} de « ${this._esc(c.title)} »${skp ? ` (${skp} déjà connus)` : ""}`
                : skp ? `Rien à importer (${skp} déjà planifiés ou refusés)` : "Collection vide");
            }
            fermerOverlay();
          } catch (err) {
            console.error("weekly-menu-card : échec collection_import", err);
            btn.disabled = false;
            btn.textContent = "Importer";
            this._toast("✕ Import impossible", true);
          }
        });
        return;
    }

  /** Exporte la semaine affichée vers une collection jow.fr
   *  (« Semaine N ») — réimportable dans l'app jow (cookbook) au
   *  moment de la liste d'achat. HA reste la source du planning. */
  async _exporterSemaine() {
    if (this._occupe || !this._hass) return;
    this._occupe = true;
    this._signature = null;
    this._render();
    this._toast("Export de la semaine vers jow.fr…");
    try {
      const resp = await this._jowCallWS("export_week", { week_offset: this._weekOffset });
      const r = resp?.response || {};
      if (r.error) {
        this._toast(`✕ Export refusé : ${r.error}${r.aide ? " — voir réponse du service" : ""}`, true);
      } else {
        this._toast(`✓ ${this._esc(r.collection || "Semaine")} exportée : ${r.exported} plats — retrouvez-la dans l'app jow (cookbook)`);
      }
    } catch (err) {
      console.error("weekly-menu-card : échec export_week", err);
      this._toast("✕ Export impossible", true);
    } finally {
      this._occupe = false;
      this._signature = null;
      this._render();
      this._differe(() => { this._signature = null; this._render(); }, 3000);
    }
  }

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
      // Remplissage automatique de semaine : ne JAMAIS écraser un repas
      // déjà planifié sur S+1 — l'écrasement est réservé au clic explicite
      // « Changer de recette » sur un jour affiché.
      data.overwrite = false;
      // Preset du jour (criteria + contraintes kcal/temps) s'il y en a un,
      // sinon enrichissement classique (thème + frigo, fallback neutre).
      const avecPreset = this._appliquerPreset(data, i);
      avecPreset.criteria =
        avecPreset.criteria || this._criteriaAvecContexte(i, data.criteria) || "plat varié équilibré";
      Object.assign(data, avecPreset);
      if (this._config.replace_ai_prompt) data.ai_prompt = this._config.replace_ai_prompt;
      try {
        if (action.domaine === "jow") {
          await this._jowCall(action.service, data);
        } else {
          await this._hass.callService(action.domaine, action.service, data);
        }
        succes++;
        this._toast(`S+1 : ${succes}/7 jours planifiés`);
      } catch (err) {
        echecs++;
        console.error(`weekly-menu-card : échec planification S+1 ${JOURS[i]}`, err);
        this._toast(`✕ Échec ${JOURS[i]} — erreur`, true);
      }
    }

    this._occupe = false;
    this._signature = null;
    this._render();
    if (echecs === 0) {
      this._toast(`✓ Semaine prochaine planifiée (${succes}/7)`);
    } else {
      this._toast(`S+1 : ${succes} réussis, ${echecs} échecs`, true);
    }
    this._differe(() => { this._signature = null; this._render(); }, 5000);
  }

  /** Appelle une action prédéfinie (meal_done, clear_meal, refresh_shopping)
   *  sur le jour actuellement affiché. */
  async _actionPredefinie(key, jourIndex) {
    const def = ACTIONS_PREDEFINIES[key];
    if (!def || this._occupe || !this._hass) return;
    // Confirmation (celle de l'action résolue, surcharge comprise)
    const act = _serviceAction(this._config, key);
    const confirmText = act?.confirm ?? def.confirm;
    if (confirmText && !(await this._dialogue(confirmText, { danger: true, ouiLabel: "Confirmer" }))) return;

    // Cas spécial : copy_meal demande un jour cible
    if (key === "copy_meal") {
      const defaut = JOURS[(jourIndex + 1) % 7];
      const choix = await this._dialogueChoix(
        "Copier vers quel jour ?",
        JOURS.map((j) => ({ value: j, label: j.charAt(0).toUpperCase() + j.slice(1) })),
        defaut,
      );
      if (!choix) return;
      const idxCible = JOURS.indexOf(choix);
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
        await this._jowCall("copy_meal", data);
        this._toast(`✓ Repas copié vers ${JOURS[idxCible]}`);
      } catch (err) {
        console.error("weekly-menu-card : échec copy_meal", err);
        this._toast("✕ Copie échouée — erreur", true);
      } finally {
        this._occupe = false;
        this._signature = null;
        this._render();
        this._differe(() => { this._signature = null; this._render(); }, 3000);
      }
      return;
    }

    // Cas spécial : favoris affiche les recettes dans un dialogue in-card
    if (key === "collections") {
      return this._ouvrirCollections();
    }
    if (key === "favoris") {
      this._occupe = true;
      this._signature = null;
      this._render();
      try {
        // callWS avec return_response au niveau top-level (pas dans service_data)
        const resp = await this._jowCallWS("sync_favorites");
        const payload = (resp && resp.response) || {};
        const recipes = payload.recipes || [];
        if (payload.error === "token_jow_absent") {
          this._toast("Aucun compte Jow configuré (refresh token requis)", true);
          this._occupe = false;
          this._signature = null;
          this._render();
          return;
        }
        if (payload.error === "auth_echouee") {
          this._toast("Authentification Jow échouée — vérifiez le refresh token", true);
          this._occupe = false;
          this._signature = null;
          this._render();
          return;
        }
        if (!recipes.length) {
          this._toast("Aucun favori dans votre compte Jow", true);
          this._occupe = false;
          this._signature = null;
          this._render();
          return;
        }
        // Afficher dans un dialogue in-card avec des boutons "Planifier"
        const R = this.shadowRoot;
        if (!R) { this._occupe = false; return; }
        this._occupe = false;
        this._signature = null;
        this._render();
        const jourLabel = JOURS[this._selection ?? this._aujourdhui()];
        const items = recipes.slice(0, 20).map((r, idx) => {
          const nom = r.name || r.title || "Recette";
          const cal = r.calories ? ` — ${this._esc(r.calories)} kcal` : "";
          const imgRaw = r.imageUrl
            ? (/^https?:\/\//i.test(r.imageUrl) ? r.imageUrl : `https://static.jow.fr/${r.imageUrl}`)
            : null;
          const img = imgRaw ? `<img src="${this._url(imgRaw, true) || ""}" style="width:40px;height:40px;border-radius:6px;object-fit:cover" alt="">` : "";
          return `<li style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--filet-fin)">
            ${img}
            <span style="flex:1"><b>${this._esc(nom)}</b><span style="color:var(--gris);font-size:0.8rem">${cal}</span></span>
            <button class="bouton" data-plan-fav="${idx}" style="padding:6px 12px;cursor:pointer">Planifier</button>
          </li>`;
        }).join("");
        const overlay = document.createElement("div");
        overlay.className = "dialogue-overlay";
        overlay.innerHTML = `<div class="dialogue" role="dialog" aria-modal="true" style="max-width:500px;max-height:80vh;overflow-y:auto">
          <p class="dialogue-msg">★ Mes favoris Jow (${recipes.length})<br><span style="color:var(--gris);font-size:0.8rem">Cliquez « Planifier » pour ajouter au ${this._esc(jourLabel)}</span></p>
          <ul style="list-style:none;padding:0;margin:0">${items}</ul>
          <div class="dialogue-boutons"><button data-rep="non">Fermer</button></div>
        </div>`;
        R.appendChild(overlay);
        const fermerOverlay = () => {
          overlay.remove();
          this._signature = null;
          this._render();
        };
        overlay.addEventListener("click", async (e) => {
          if (e.target === overlay) { fermerOverlay(); return; }
          const closeBtn = e.target.closest('[data-rep="non"]');
          if (closeBtn) { fermerOverlay(); return; }
          const btn = e.target.closest("[data-plan-fav]");
          if (!btn) return;
          const idx = Number(btn.dataset.planFav);
          const rec = recipes[idx];
          const nom = rec.name || rec.title;
          btn.disabled = true;
          btn.textContent = "…";
          try {
            // Épingler par id exact quand disponible (favori Jow) : la
            // recherche par titre peut matcher une variante du même nom.
            // Repli query si l'id est absent.
            const data = {
              query: nom,
              weekday: JOURS[this._selection ?? this._aujourdhui()],
              week_offset: this._weekOffset,
              choice: 1,
            };
            if (rec.id || rec._id) data.recipe_id = String(rec.id || rec._id);
            await this._jowCall("plan_meal", data);
            btn.textContent = "✓ Planifié";
            btn.style.borderColor = "#4a9";
          } catch (err) {
            btn.textContent = "✕ Erreur";
            btn.style.borderColor = "#a33";
            btn.disabled = false;
          }
        });
      } catch (err) {
        console.error("weekly-menu-card : échec favoris", err);
        this._toast("✕ Favoris indisponibles", true);
        this._occupe = false;
        this._signature = null;
        this._render();
      }
      return;
    }

    // Service générique : surchargeable via actions.<clé>_service
    const actGen = _serviceAction(this._config, key);
    if (!actGen) return;
    const { domaine, service, data: dataTemplate } = actGen;

    // Remplir les jetons {weekday}, {index}
    const remplir = (v) => (typeof v === "string"
      ? v.replace("{weekday}", JOURS[jourIndex]).replace("{index}", String(jourIndex))
      : v);
    const data = Object.fromEntries(
      Object.entries(dataTemplate || {}).map(([k, v]) => [k, remplir(v)])
    );
    // Actions jow.* : suivre la semaine affichée (S0/S+1) et viser la
    // bonne instance. refresh_shopping_list avait week_offset: 0 en dur,
    // meal_done/clear_meal n'envoyaient aucun week_offset.
    if (domaine === "jow" && !("week_offset" in data)) {
      data.week_offset = this._weekOffset;
    }
    // rescue : flag du service suggest + criteria neutre si absent
    if (key === "rescue") {
      data.rescue_expiry = true;
      if (!data.criteria) data.criteria = "plat qui utilise les ingrédients à sauver";
      this._toast("⏰ Recherche d'une recette pour écouler les périssables…");
    }

    this._occupe = true;
    this._signature = null;
    this._render();
    try {
      if (domaine === "jow") {
        await this._jowCall(service, data);
      } else {
        await this._hass.callService(domaine, service, data);
      }
      this._toast(`✓ ${def.label}`);
    } catch (err) {
      console.error(`weekly-menu-card : échec de ${domaine}.${service}`, err);
      this._toast(`✕ ${def.label} — erreur`, true);
    } finally {
      this._occupe = false;
      this._signature = null;
      this._render();
      this._differe(() => { this._signature = null; this._render(); }, 3000);
    }
  }

  /** Dialogue modal de confirmation (remplace window.confirm, non
   *  supporté dans le webview de l'app mobile HA).
   *  Retourne une Promise<boolean>. */
  _dialogue(message, opts = {}) {
    return new Promise((resolve) => {
      const R = this.shadowRoot;
      if (!R) { resolve(false); return; }
      const overlay = document.createElement("div");
      overlay.className = "dialogue-overlay";
      overlay.innerHTML = `<div class="dialogue" role="alertdialog" aria-modal="true">
        <p class="dialogue-msg">${this._esc(message)}</p>
        <div class="dialogue-boutons">
          <button data-rep="non">${this._esc(opts.nonLabel || "Annuler")}</button>
          <button class="${opts.danger ? "danger" : ""}" data-rep="oui">${this._esc(opts.ouiLabel || "OK")}</button>
        </div>
      </div>`;
      R.appendChild(overlay);
      const fermer = (val) => { overlay.remove(); resolve(val); };
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) fermer(false);
        const btn = e.target.closest("[data-rep]");
        if (btn) fermer(btn.dataset.rep === "oui");
      });
      overlay.querySelector('[data-rep="oui"]')?.focus();
    });
  }

  /** Dialogue modal avec un menu déroulant (remplace window.prompt).
   *  Retourne une Promise<string|null>. */
  _dialogueChoix(message, options, defaut) {
    return new Promise((resolve) => {
      const R = this.shadowRoot;
      if (!R) { resolve(null); return; }
      const opts = options.map((o) =>
        `<option value="${this._esc(o.value)}"${o.value === defaut ? " selected" : ""}>${this._esc(o.label)}</option>`
      ).join("");
      const overlay = document.createElement("div");
      overlay.className = "dialogue-overlay";
      overlay.innerHTML = `<div class="dialogue" role="alertdialog" aria-modal="true">
        <p class="dialogue-msg">${this._esc(message)}</p>
        <select class="dialogue-select">${opts}</select>
        <div class="dialogue-boutons">
          <button data-rep="non">Annuler</button>
          <button data-rep="oui">OK</button>
        </div>
      </div>`;
      R.appendChild(overlay);
      const select = overlay.querySelector("select");
      const fermer = (val) => { overlay.remove(); resolve(val); };
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) fermer(null);
        const btn = e.target.closest("[data-rep]");
        if (btn) fermer(btn.dataset.rep === "oui" ? select.value : null);
      });
      select?.focus();
    });
  }

  /** Diffère un re-render en stockant le timer pour nettoyage. Les
   *  timers survivant à une déconnexion sont ignorés sans effet. */
  _differe(fn, delai) {
    if (!this._timers) this._timers = [];
    const id = setTimeout(() => {
      this._timers = this._timers?.filter((t) => t !== id);
      /* carte retirée du dashboard : ne rien faire (shadow root vide) */
      if (!this.isConnected) return;
      fn();
    }, delai);
    this._timers.push(id);
  }

  disconnectedCallback() {
    if (this._timers) this._timers.forEach((t) => clearTimeout(t));
    this._timers = null;
    if (this._toastTimer) clearTimeout(this._toastTimer);
  }

  /** Affiche un message éphémère en bas de la carte. */
  _toast(msg, isError = false) {
    // mémoriser : un _render() (inner remplacé) peut survenir pendant la
    // durée d'affichage — le toast est recréé à chaque rendu par
    // _restaurerToast, sinon l'utilisateur ne voyait RIEN (toast détruit
    // par le finally des actions, avant ses 2,5 s).
    this._toastPending = { msg, isError };
    this._restaurerToast();
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this._toastPending = null;
      const el = this.shadowRoot?.querySelector(".toast");
      if (el) el.classList.remove("show");
    }, 3000);
  }

  _restaurerToast() {
    const R = this.shadowRoot;
    const t = this._toastPending;
    if (!R || !t) return;
    let el = R.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      R.appendChild(el);
    }
    el.textContent = t.msg;
    el.style.background = t.isError ? "#a33" : "";
    requestAnimationFrame(() => el.classList.add("show"));
  }

  /** Appelle un service jow.* en injectant entry_name si configuré
   *  (multi-instance) — point de passage unique pour tous les appels. */
  _jowCall(service, data = {}) {
    if (!this._hass) return Promise.resolve();
    if (this._config?.entry_name) {
      data = { ...data, entry_name: this._config.entry_name };
    }
    return this._hass.callService("jow", service, data);
  }

  /** Appelle un service jow.* via WebSocket avec réponse (return_response)
   *  en injectant entry_name si configuré. */
  _jowCallWS(service, data = {}) {
    if (!this._hass) return Promise.resolve({});
    if (this._config?.entry_name) {
      data = { ...data, entry_name: this._config.entry_name };
    }
    return this._hass.callWS({
      type: "call_service",
      domain: "jow",
      service,
      service_data: data,
      return_response: true,
    });
  }

  /** Déplace un plat d'un jour à un autre (copy_meal + clear_meal source). */
  async _deplacerPlat(from, to) {
    if (this._occupe || !this._hass) return;
    this._occupe = true;
    this._signature = null;
    this._render();
    try {
      await this._jowCall("copy_meal", {
        weekday: JOURS[from],
        to_weekday: JOURS[to],
        week_offset: this._weekOffset,
        to_week_offset: this._weekOffset,
      });
      await this._jowCall("clear_meal", {
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
      this._differe(() => { this._signature = null; this._render(); }, 3000);
    }
  }

  /** Change le nombre de couverts d'un jour via le service jow.set_covers. */
  async _changerCouverts(i, delta) {
    const jour = this._jour(i);
    if (!jour?.planned || this._occupe || !this._hass) return;
    const actuel = jour.couverts || 2;
    const nouveau = Math.max(1, Math.min(20, actuel + delta));
    if (nouveau === actuel) return;
    this._occupe = true;
    this._signature = null;
    this._render();
    try {
      await this._jowCall("set_covers", {
        weekday: JOURS[i],
        week_offset: this._weekOffset,
        covers: nouveau,
      });
      this._toast(`✓ ${nouveau} couvert${nouveau > 1 ? "s" : ""} pour ${JOURS[i]}`);
    } catch (err) {
      console.error("weekly-menu-card : échec set_covers", err);
      this._toast("✕ Couverts non modifiés — erreur", true);
    } finally {
      this._occupe = false;
      // HA n'envoie pas toujours d'update au frontend quand seuls les
      // attributs changent. On force des re-renders différés qui liront
      // this._hass.states (mis à jour par HA via le bus d'événements).
      this._signature = null;
      this._render();
      this._differe(() => { this._signature = null; this._render(); }, 500);
      this._differe(() => { this._signature = null; this._render(); }, 2000);
    }
  }

  /** Affiche une popup avec le contexte IA (allergies, préférences, frigo,
   *  thèmes, plats récents, météo, prompt). */
  async _afficherInfo() {
    const R = this.shadowRoot;
    if (!R) return;

    // Récupérer le contexte depuis l'intégration via WebSocket
    let jowContext = null;
    try {
      const resp = await this._jowCallWS("get_context");
      jowContext = resp?.response || resp?.result?.response || {};
    } catch (e) { /* ignore */ }

    // Collecter le contexte local
    const themes = this._config.day_themes || {};
    const themesList = Object.entries(themes).map(([j, t]) => `<li>${j} : ${this._esc(t)}</li>`).join("");
    const frigo = this._config.fridge_ingredients?.trim();
    const prompt = this._config.replace_ai_prompt?.trim();
    const criteria = this._config.replace_action?.data?.criteria || "";

    // Météo
    const weatherEnt = this._config.replace_action?.data?.weather_entity;
    let meteo = "Non configurée";
    if (weatherEnt && this._hass.states[weatherEnt]) {
      const s = this._hass.states[weatherEnt];
      const temp = s.attributes?.temperature;
      meteo = `${s.state}${temp ? `, ${temp}°C` : ""}`;
    }

    // Plats récents depuis l'intégration
    const recentsJow = jowContext?.recent_meals || [];
    const recents = recentsJow.length
      ? recentsJow.map((r) => {
          const excl = r.excluded !== false;
          return `<li>${this._esc(r.name)} <span style="color:var(--gris)">(${this._esc(r.date)})</span> ${
            excl ? `<button data-clear-recent="${this._esc(r.date)}" style="margin-left:8px;padding:2px 8px;font-size:0.7rem;cursor:pointer;border:1px solid #666;border-radius:4px;background:none;color:inherit">Retirer</button>` : '<span style="color:#4a9;font-size:0.7rem">✓ retiré</span>'
          }</li>`;
        }).join("")
      : "<li>Aucun</li>";

    // Ingrédients exclus du compte Jow
    const excluded = jowContext?.excluded_ingredients || [];
    const excludedHtml = excluded.length
      ? excluded.map((e) => this._esc(e)).join(", ")
      : "Aucun";

    // Ingrédients interdits (banned)
    const banned = jowContext?.banned_ingredients || [];
    const bannedHtml = banned.length
      ? banned.map((b) => `<span style="display:inline-block;margin:2px 4px;padding:2px 8px;border:1px solid #a33;border-radius:4px">${this._esc(b)} <button data-remove-banned="${this._esc(b)}" style="border:none;background:none;color:#a33;cursor:pointer;font-size:0.8rem">✕</button></span>`).join("")
      : "Aucun";

    // Ingrédients à éviter (avoid)
    const avoid = jowContext?.avoid_ingredients || [];
    const avoidHtml = avoid.length
      ? avoid.map((a) => `<span style="display:inline-block;margin:2px 4px;padding:2px 8px;border:1px solid #c93;border-radius:4px">${this._esc(a)} <button data-remove-avoid="${this._esc(a)}" style="border:none;background:none;color:#c93;cursor:pointer;font-size:0.8rem">✕</button></span>`).join("")
      : "Aucun";

    // Agent IA
    const aiEnt = this._config.replace_action?.data?.ai_entity || "Non configuré";

    // Connexion Jow
    const jowConnected = jowContext?.jow_connected ? "✓ Connecté" : "✕ Non connecté";

    const html = `
      <div class="info-overlay" data-info-close="1"></div>
      <div class="info-popup">
        <span class="info-close" data-info-close="1">✕</span>
        <h3>Contexte de l'IA</h3>
        <div class="info-section">
          <h4>Compte Jow</h4>
          <p>${jowConnected}</p>
        </div>
        <div class="info-section">
          <h4>Allergies / interdits (Jow)</h4>
          <p>${jowContext?.allergies ? this._esc(jowContext.allergies) : "Aucune"}</p>
        </div>
        <div class="info-section">
          <h4>Préférences (Jow)</h4>
          <p>${jowContext?.preferences ? this._esc(jowContext.preferences) : "Aucune"}</p>
        </div>
        <div class="info-section">
          <h4>Ingrédients exclus (Jow)</h4>
          <p>${excludedHtml}</p>
        </div>
        <div class="info-section">
          <h4>Ingrédients interdits (allergies)</h4>
          <div>${bannedHtml}</div>
          <div style="margin-top:6px"><input type="text" data-add-banned placeholder="Ajouter un ingrédient interdit…" style="padding:4px 8px;font-size:0.78rem;border:1px solid var(--filet);border-radius:4px;background:var(--encre-2);color:var(--papier);width:100%;box-sizing:border-box"></div>
        </div>
        <div class="info-section">
          <h4>Ingrédients à éviter (préférence)</h4>
          <div>${avoidHtml}</div>
          <div style="margin-top:6px"><input type="text" data-add-avoid placeholder="Ajouter un ingrédient à éviter…" style="padding:4px 8px;font-size:0.78rem;border:1px solid var(--filet);border-radius:4px;background:var(--encre-2);color:var(--papier);width:100%;box-sizing:border-box"></div>
        </div>
        <div class="info-section">
          <h4>Plats récents (anti-répétition)</h4>
          <ul>${recents}</ul>
        </div>
        <div class="info-section">
          <h4>Thèmes par jour</h4>
          ${themesList ? `<ul>${themesList}</ul>` : "<p>Aucun thème configuré</p>"}
        </div>
        <div class="info-section">
          <h4>Ingrédients du frigo</h4>
          <p>${frigo ? this._esc(frigo) : "Non renseigné"}</p>
        </div>
        <div class="info-section">
          <h4>Météo</h4>
          <p>${this._esc(meteo)}</p>
        </div>
        <div class="info-section">
          <h4>Agent IA</h4>
          <p>${this._esc(aiEnt)}</p>
        </div>
        <div class="info-section">
          <h4>Critère par défaut</h4>
          <p>${criteria ? this._esc(criteria) : "Aucun"}</p>
        </div>
        <div class="info-section">
          <h4>Prompt IA personnalisé</h4>
          <p>${prompt ? this._esc(prompt) : "Par défaut (non personnalisé)"}</p>
        </div>
      </div>`;

    const container = document.createElement("div");
    container.innerHTML = html;
    R.appendChild(container);

    // Brancher la fermeture
    R.querySelectorAll("[data-info-close]").forEach((el) => {
      el.addEventListener("click", () => container.remove());
    });

    // Boutons "Retirer" pour l'anti-répétition
    R.querySelectorAll("[data-clear-recent]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const date = btn.dataset.clearRecent;
        btn.disabled = true;
        btn.textContent = "…";
        try {
          await this._jowCall("clear_recent", { date });
          btn.textContent = "✓ retiré";
          btn.style.color = "#4a9";
          btn.disabled = false;
        } catch (err) {
          btn.textContent = "✕ erreur";
          btn.style.color = "#a33";
        }
      });
    });

    // Boutons "✕" pour retirer un ingrédient interdit
    R.querySelectorAll("[data-remove-banned]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ing = btn.dataset.removeBanned;
        try {
          await this._jowCall("add_banned", { ingredient: ing, action: "remove" });
          const span = btn.parentElement;
          span.style.opacity = "0.3";
          span.style.textDecoration = "line-through";
        } catch (err) { console.error(err); }
      });
    });

    // Inputs "Ajouter" un ingrédient interdit
    R.querySelectorAll("[data-add-banned]").forEach((input) => {
      input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter" && input.value.trim()) {
          try {
            await this._jowCall("add_banned", { ingredient: input.value.trim(), action: "add" });
            input.value = "";
            input.placeholder = "✓ Ajouté — rouvrez ℹ pour voir";
          } catch (err) { input.placeholder = "✕ Erreur"; }
        }
      });
    });

    // Boutons "✕" pour retirer un ingrédient à éviter
    R.querySelectorAll("[data-remove-avoid]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ing = btn.dataset.removeAvoid;
        try {
          await this._jowCall("add_avoid", { ingredient: ing, action: "remove" });
          const span = btn.parentElement;
          span.style.opacity = "0.3";
          span.style.textDecoration = "line-through";
        } catch (err) { console.error(err); }
      });
    });

    // Inputs "Ajouter" un ingrédient à éviter
    R.querySelectorAll("[data-add-avoid]").forEach((input) => {
      input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter" && input.value.trim()) {
          try {
            await this._jowCall("add_avoid", { ingredient: input.value.trim(), action: "add" });
            input.value = "";
            input.placeholder = "✓ Ajouté — rouvrez ℹ pour voir";
          } catch (err) { input.placeholder = "✕ Erreur"; }
        }
      });
    });
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

  /** Preset de critères applicable au jour i (null si aucun).
   *  Un preset définit criteria + max_calories/max_total_time pour le
   *  choix automatique et « Changer de recette » du jour — plusieurs
   *  jours peuvent partager le même preset. */
  _presetDuJour(i) {
    const presets = this._config.criteria_presets || [];
    const jour = JOURS[i];
    for (const p of presets) {
      const days = Array.isArray(p.days) ? p.days : [];
      if (days.includes(jour)) return p;
    }
    return null;
  }

  /** Applique le preset du jour aux données de service (criteria fusionné
   *  avec le contexte, contraintes quantitatives injectées). Ne s'applique
   *  qu'au choix automatique / Changer de recette — jamais au prompt libre
   *  de la barre « Proposer un plat ». */
  _appliquerPreset(data, i) {
    const preset = this._presetDuJour(i);
    if (!preset) return data;
    const out = { ...data };
    const base = preset.criteria?.trim();
    out.criteria = this._criteriaAvecContexte(i, base || out.criteria);
    if (preset.max_calories != null) out.max_calories = Number(preset.max_calories);
    if (preset.max_total_time != null) out.max_total_time = Number(preset.max_total_time);
    return out;
  }

  /** Ouvre les recettes de la semaine sur jow.fr dans des onglets.
   *  L'utilisateur n'a plus qu'à cliquer "Ajouter au menu" sur chacune.
   *  On ouvre le premier onglet directement (user gesture, pas de popup
   *  blocker) et les autres via une fenêtre intermédiaire avec des liens. */
  /** Mode du bouton Envoyer : source unique — actions.send_jow_mode
   *  (éditeur graphique) d'abord, repli sur la clé racine (YAML manuel).
   *  Avant, le libellé lisait actions.* et l'action la racine : le
   *  bouton affichait « Envoyer » mais ouvrait des onglets. */
  _sendJowMode() {
    const a = this._config.actions || {};
    return a.send_jow_mode || this._config.send_jow_mode || "tabs";
  }

  _envoyerJow() {
    // Mode service : le vrai envoi via jow.send_menu — chaque recette
    // part avec sa date et ses couverts.
    if (this._sendJowMode() === "service") {
      this._envoyerJowService();
      return;
    }
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

    // Pour les suivants : afficher un dialogue in-card avec des boutons
    // (les popups différés window.open sont bloqués sur mobile).
    if (urls.length > 1) {
      const R = this.shadowRoot;
      if (!R) return;
      const overlay = document.createElement("div");
      overlay.className = "dialogue-overlay";
      const items = urls.map((u, i) =>
        `<button class="bouton" data-url="${this._esc(u)}" style="width:100%;text-align:left;margin-bottom:8px">Recette ${i + 1} ↗</button>`
      ).join("");
      overlay.innerHTML = `<div class="dialogue" role="dialog" aria-modal="true">
        <p class="dialogue-msg">Ouvrir les autres recettes sur Jow</p>
        <div>${items}</div>
        <div class="dialogue-boutons"><button data-rep="non">Fermer</button></div>
      </div>`;
      R.appendChild(overlay);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) { overlay.remove(); return; }
        const btn = e.target.closest("[data-rep]");
        if (btn) { overlay.remove(); return; }
        const urlBtn = e.target.closest("[data-url]");
        if (urlBtn) { window.open(urlBtn.dataset.url, "_blank", "noopener,noreferrer"); }
      });
    }
  }

  /** Action sur la semaine entière (en-tête) : clear_week / renew_week.
   *  Suivent la semaine affichée (S/S+1) et l'instance configurée. */
  async _actionSemaine(key, def) {
    if (this._occupe || !this._hass) return;
    this._occupe = true;
    this._signature = null;
    this._render();
    // renew : long (7 suggestions IA) — message d'attente dédié
    this._toast(key === "renew_week"
      ? "🎲 Renouvellement de la semaine en cours (7 suggestions IA)…"
      : `${def.icon} …`);
    try {
      const data = { week_offset: this._weekOffset };
      // renew : reprendre le contexte IA de la carte si configuré
      if (key === "renew_week") {
        const ra = this._config.replace_action;
        if (ra?.data?.ai_entity) data.ai_entity = ra.data.ai_entity;
        if (ra?.data?.weather_entity) data.weather_entity = ra.data.weather_entity;
        if (ra?.data?.covers) data.covers = ra.data.covers;
        if (this._config.replace_ai_prompt) data.ai_prompt = this._config.replace_ai_prompt;
        const preset = this._config.criteria_presets?.[0];
        if (preset?.max_calories) data.max_calories = preset.max_calories;
        if (preset?.max_total_time) data.max_total_time = preset.max_total_time;
      }
      const resp = await this._jowCallWS(key, data);
      const r = resp?.response || {};
      if (key === "renew_week") {
        const planned = r.planned ?? 0;
        const failed = Object.keys(r.failures || {}).length;
        this._toast(planned > 0
          ? `✓ Semaine renouvelée : ${planned} nouveaux plats${failed ? ` (${failed} échecs)` : ""}`
          : "Aucune suggestion disponible — vérifiez l'agent IA", planned === 0);
      } else {
        this._toast("✓ Semaine vidée (plats mémorisés comme refusés)");
      }
    } catch (err) {
      console.error(`weekly-menu-card : échec ${key}`, err);
      this._toast("✕ Action impossible", true);
    } finally {
      this._occupe = false;
      this._signature = null;
      this._render();
      this._differe(() => { this._signature = null; this._render(); }, 3000);
    }
  }

  /** Envoi du planning au compte Jow via jow.send_menu (avec dates). */
  async _envoyerJowService() {
    if (this._occupe || !this._hass) return;
    this._occupe = true;
    this._signature = null;
    this._render();
    this._toast("Envoi du menu à Jow…");
    try {
      const resp = await this._jowCallWS("send_menu", { week_offset: this._weekOffset });
      const sent = resp?.response?.sent ?? 0;
      this._toast(sent > 0
        ? `✓ ${sent} recette${sent > 1 ? "s" : ""} envoyée${sent > 1 ? "s" : ""} à Jow`
        : "Aucun repas planifié à envoyer", sent === 0);
    } catch (err) {
      console.error("weekly-menu-card : échec send_menu", err);
      this._toast("✕ Envoi impossible — token Jow requis ?", true);
    } finally {
      this._occupe = false;
      this._signature = null;
      this._render();
      this._differe(() => { this._signature = null; this._render(); }, 3000);
    }
  }

  /** Import du menu Jow vers le planning HA (jours vides seulement). */
  async _importerDepuisJow() {
    if (this._occupe || !this._hass) return;
    this._occupe = true;
    this._signature = null;
    this._render();
    this._toast("Import du menu Jow…");
    try {
      const resp = await this._jowCallWS("import_menu", { week_offset: this._weekOffset });
      const r = resp?.response || {};
      if (r.error === "token_jow_absent") {
        this._toast("Aucun compte Jow configuré (refresh token requis)", true);
      } else if (typeof r.error === "string") {
        // http_* : API instable ; lecture_letscook_impossible : panne réseau
        this._toast("Jow a refusé la lecture du menu — vérifiez votre connexion et réessayez", true);
      } else {
        const imp = r.imported ?? 0;
        const skp = r.skipped ?? 0;
        const rem = r.remaining ?? 0;
        if (imp > 0) {
          this._toast(`✓ ${imp} plat${imp > 1 ? "s" : ""} importé${imp > 1 ? "s" : ""}${rem ? ` · ${rem} en attente` : ""}`);
        } else if (rem > 0) {
          this._toast(`Semaine pleine — ${rem} plat${rem > 1 ? "s" : ""} du menu Jow en attente d'un jour libre`);
        } else if (skp > 0) {
          this._toast(`Menu Jow : ${skp} plat${skp > 1 ? "s" : ""} déjà planifié${skp > 1 ? "s" : ""} ou refusé${skp > 1 ? "s" : ""}`);
        } else {
          this._toast("Menu Jow vide — ajoutez des recettes sur jow.fr ou utilisez 🎲", true);
        }
      }
    } catch (err) {
      console.error("weekly-menu-card : échec import_menu", err);
      this._toast("✕ Import impossible", true);
    } finally {
      this._occupe = false;
      this._signature = null;
      this._render();
      this._differe(() => { this._signature = null; this._render(); }, 3000);
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
    // Anti-double-tap : sur mobile, le webview peut déclencher deux
    // évènements click (touch + synthétique) sur le MÊME bouton. On
    // ignore un second clic sur le même jour dans les 3 s ; un clic
    // sur un autre jour n'est pas pénalisé.
    const maintenant = Date.now();
    if (
      this._dernierRemplacement != null &&
      this._dernierRemplacement.jour === i &&
      this._dernierRemplacement.week === this._weekOffset &&
      maintenant - this._dernierRemplacement.t < 3000
    ) return;
    this._dernierRemplacement = { jour: i, week: this._weekOffset, t: maintenant };
    const jour = this._jour(i);

    // Les jetons {date} et {weekday} permettent de viser le bon jour sans
    // que la carte connaisse la signature du service.
    const remplir = (v) => (typeof v === "string"
      ? v.replace("{date}", jour.date).replace("{weekday}", JOURS[i]).replace("{index}", String(i))
      : v);
    let data = Object.fromEntries(
      Object.entries(action.data).map(([k, v]) => [k, remplir(v)])
    );
    data.week_offset = this._weekOffset;
    // Preset du jour (criteria + max_calories/max_total_time) : s'applique
    // au bouton « Changer de recette ». Sans preset : enrichissement
    // classique (thème du jour + frigo), sans champ criteria vide.
    data = this._appliquerPreset(data, i);
    if (!data.criteria) {
      const criteria = this._criteriaAvecContexte(i, data.criteria);
      if (criteria) data.criteria = criteria;
      else delete data.criteria;
    }
    // Prompt IA personnalisé
    if (this._config.replace_ai_prompt) data.ai_prompt = this._config.replace_ai_prompt;

    this._occupe = true;
    this._signature = null;
    this._render();
    try {
      if (action.domaine === "jow") {
        await this._jowCall(action.service, data);
      } else {
        await this._hass.callService(action.domaine, action.service, data);
      }
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
      this._differe(() => { this._signature = null; this._render(); }, 3000);
      this._differe(() => { this._signature = null; this._render(); }, 8000);
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
    // Le critère saisi est enrichi avec le thème du jour et le frigo ;
    // _suggest n'est appelé qu'avec du texte non vide (garde amont).
    data.criteria = this._criteriaAvecContexte(i, texte.trim());
    data.week_offset = this._weekOffset;
    if (this._config.replace_ai_prompt) data.ai_prompt = this._config.replace_ai_prompt;

    this._occupe = true;
    this._signature = null;
    this._render();
    try {
      if (action.domaine === "jow") {
        await this._jowCall(action.service, data);
      } else {
        await this._hass.callService(action.domaine, action.service, data);
      }
      this._toast(`✓ Recherche lancée pour ${JOURS[i]}`);
    } catch (err) {
      console.error(`weekly-menu-card : échec suggest personnalisé`, err);
      this._toast("✕ Recherche échouée — erreur", true);
    } finally {
      this._occupe = false;
      this._signature = null;
      this._render();
      this._differe(() => { this._signature = null; this._render(); }, 3000);
      this._differe(() => { this._signature = null; this._render(); }, 8000);
    }
  }

  /** Menu tactile contextuel (alternative au drag & drop sur mobile).
   *  S'ouvre sur long-press d'une ligne planifiée. */
  _menuTactile(from, event) {
    const R = this.shadowRoot;
    if (!R) return;
    const jour = this._jour(from);
    if (!jour?.planned) return;
    // Fermer un menu existant
    R.querySelector(".menu-tactile")?.remove();
    const menu = document.createElement("div");
    menu.className = "menu-tactile";
    // Destinations : tous les autres jours, libres d'abord (un plat se
    // déplace naturellement vers un jour vide ; écraser un repas existant
    // reste possible via "Copier vers…").
    const dests = JOURS.map((j, i) => ({ j, i }))
      .filter(({ i }) => i !== from && !this._jour(i).planned);
    menu.innerHTML = `<div class="mt-titre">Déplacer « ${this._esc(jour.nom)} » vers</div>
      ${dests.map(({ j, i }) =>
        `<button data-vers="${i}">${COURTS[i]} ${this._esc(j)}</button>`
      ).join("")}
      <button class="danger" data-vers="-1">Annuler</button>`;
    R.appendChild(menu);
    // Positionner
    const rect = event instanceof TouchEvent
      ? event.touches[0]?.getClientRects?.()[0] || event.target.getBoundingClientRect()
      : event.target.getBoundingClientRect();
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
    menu.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - 10)}px`;
    // Brancher
    menu.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-vers]");
      if (!btn) return;
      const to = Number(btn.dataset.vers);
      menu.remove();
      if (to >= 0) await this._deplacerPlat(from, to);
    });
    // Fermer en cliquant ailleurs
    const close = (ev) => {
      if (!menu.isConnected) { R.removeEventListener("click", close); return; }
      if (!menu.contains(ev.target)) { menu.remove(); R.removeEventListener("click", close); }
    };
    setTimeout(() => R.addEventListener("click", close), 0);
  }

  _brancher() {
    const R = this.shadowRoot;

    R.querySelectorAll(".ligne[data-jour]").forEach((el) => {
      el.addEventListener("click", () => this._afficher(Number(el.dataset.jour)));
    });

    /* Vue mensuelle : un clic sur un plat bascule la carte sur cette
       semaine et affiche ce jour en détail. */
    R.querySelectorAll("[data-mois-jour]").forEach((el) => {
      el.addEventListener("click", () => {
        const offset = Number(el.dataset.moisOffset);
        const jour = Number(el.dataset.moisJour);
        if (offset === 0 || offset === 1) {
          if (offset !== this._weekOffset) {
            this._weekOffset = offset;
            this._imagesKO.clear();
          }
          this._selection = jour;
          this._config = { ...this._config, show_month: false };
          this._signature = null;
          this._render();
        }
      });
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

    R.querySelectorAll("[data-import-jow]").forEach((el) => {
      el.addEventListener("click", () => this._importerDepuisJow());
    });
    // Exporter la semaine vers jow.fr (collection « Semaine N »)
    R.querySelectorAll("[data-export-week]").forEach((el) => {
      el.addEventListener("click", () => this._exporterSemaine());
    });
    // Importer une collection (dialog, semaine affichée)
    R.querySelectorAll("[data-coll-open]").forEach((el) => {
      el.addEventListener("click", () => this._ouvrirCollections());
    });
    // Actions semaine entière : vider / renouveler (avec confirmation)
    R.querySelectorAll("[data-action-semaine]").forEach((el) => {
      el.addEventListener("click", async () => {
        const key = el.dataset.actionSemaine;
        const def = ACTIONS_PREDEFINIES[key];
        if (!def || this._occupe || !this._hass) return;
        const act = _serviceAction(this._config, key);
        const confirmText = act?.confirm ?? def.confirm;
        if (confirmText && !(await this._dialogue(confirmText, { danger: true, ouiLabel: "Confirmer" }))) return;
        await this._actionSemaine(key, def);
      });
    });
    R.querySelectorAll("[data-envoyer-jow]").forEach((el) => {
      el.addEventListener("click", () => this._envoyerJow());
    });

    R.querySelectorAll("[data-recette]").forEach((el) => {
      el.addEventListener("click", () => {
        const i = Number(el.dataset.recette);
        const jour = this._jour(i);
        const url = this._url(jour.url);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      });
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

    // Bascule entre semaine courante (S) et semaine prochaine (S+1).
    // En vue mensuelle, "Quitter" (offset 0) referme aussi la vue.
    R.querySelectorAll("[data-semaine]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const offset = Number(btn.dataset.semaine);
        let change = false;
        if (offset !== this._weekOffset) {
          this._weekOffset = offset;
          this._selection = null;
          this._imagesKO.clear();
          change = true;
        }
        if (this._config.show_month) {
          this._config = { ...this._config, show_month: false };
          change = true;
        }
        if (change) {
          this._signature = null;
          this._render();
        }
      });
    });

    // Bouton info (contexte IA)
    R.querySelectorAll("[data-info]").forEach((btn) => {
      btn.addEventListener("click", () => this._afficherInfo());
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
          await this._jowCall("exclude_ingredient", { ingredient: ing });
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

    // Alternative tactile au drag & drop : long-press sur une ligne
    // planifiée ouvre un menu de destination (sans attendre un drop).
    R.querySelectorAll("[data-drag-jour]").forEach((el) => {
      let timer = null;
      let started = false;
      const start = (e) => {
        if (e.button != null && e.button !== 0) return;
        started = false;
        timer = setTimeout(() => {
          started = true;
          e.preventDefault();
          this._menuTactile(Number(el.dataset.dragJour), e);
        }, 500);
      };
      const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
      el.addEventListener("touchstart", start, { passive: false });
      el.addEventListener("touchend", cancel);
      el.addEventListener("touchmove", cancel);
      el.addEventListener("touchcancel", cancel);
      el.addEventListener("mousedown", start);
      el.addEventListener("mouseup", cancel);
      el.addEventListener("mouseleave", cancel);
      // Empêcher le menu contextuel natif sur mobile
      el.addEventListener("contextmenu", (e) => { if (started) e.preventDefault(); });
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
  presets_section: "Critères par jour (choix automatique)",
  presets_help: "Presets appliqués au choix automatique et « Changer de recette » des jours sélectionnés — jamais à la barre « Proposer un plat ».",
  preset_1_name: "Preset 1 — nom",
  preset_1_criteria: "Preset 1 — critère (ex : plat léger équilibré)",
  preset_1_calories: "Preset 1 — calories max (kcal, vide = aucune)",
  preset_1_time: "Preset 1 — temps total max (min, vide = aucun)",
  preset_1_days: "Preset 1 — jours concernés",
  preset_2_name: "Preset 2 — nom",
  preset_2_criteria: "Preset 2 — critère",
  preset_2_calories: "Preset 2 — calories max (kcal, vide = aucune)",
  preset_2_time: "Preset 2 — temps total max (min, vide = aucun)",
  preset_2_days: "Preset 2 — jours concernés",
  preset_3_name: "Preset 3 — nom",
  preset_3_criteria: "Preset 3 — critère",
  preset_3_calories: "Preset 3 — calories max (kcal, vide = aucune)",
  preset_3_time: "Preset 3 — temps total max (min, vide = aucun)",
  preset_3_days: "Preset 3 — jours concernés",
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
  replace_ai_prompt: "Prompt IA personnalisé (remplace le prompt par défaut)",
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
  action_rescue: "Bouton « Sauver les périssables » (suggest rescue)",
  action_import_jow: "Bouton « Importer depuis Jow » (menu jow.fr → planning)",
  action_clear_week: "Bouton « Vider la semaine » (en-tête)",
  action_renew_week: "Bouton « Renouveler la semaine » (en-tête)",
  send_jow_mode: "Mode du bouton Envoyer à Jow (tabs = ouvrir jow.fr, service = jow.send_menu)",
  // ---- Entités ----
  entites: "Entités des 7 jours (lundi à dimanche)",
  entites_s1: "Entités S+1 (semaine prochaine — auto si vide)",
  prefix: "Préfixe des entités (ex : sensor.jow_)",
  entry_name: "Instance Jow (multi-instance — vide = défaut)",
  s1lundi: "Lundi S+1", s1mardi: "Mardi S+1", s1mercredi: "Mercredi S+1",
  s1jeudi: "Jeudi S+1", s1vendredi: "Vendredi S+1", s1samedi: "Samedi S+1",
  s1dimanche: "Dimanche S+1",
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
      // ---- Presets de critères (choix automatique par jour) ----
      { type: "expandable", name: "presets_section", title: LIBELLES.presets_section, schema:
        [1, 2, 3].flatMap((n) => [
          { name: `preset_${n}_name`, selector: { text: {} } },
          { name: `preset_${n}_criteria`, selector: { text: {} } },
          { name: `preset_${n}_calories`, selector: { number: { min: 100, max: 2000, step: 10, mode: "box" } } },
          { name: `preset_${n}_time`, selector: { number: { min: 5, max: 240, step: 5, mode: "box" } } },
          { name: `preset_${n}_days`, selector: { select: { multiple: true, options: JOURS } } },
        ]),
      },
      // ---- Bouton « Changer de recette » ----
      { type: "expandable", name: "replace_section", title: LIBELLES.replace_section, schema: [
        { name: "replace_enabled", selector: { boolean: {} } },
        { name: "replace_service", selector: { text: {} }, default: "jow.suggest" },
        { name: "replace_criteria", selector: { text: { multiline: true } } },
        { name: "replace_covers", selector: { number: { min: 1, max: 12, mode: "slider" } } },
        { name: "replace_weather", selector: { entity: { domain: ["weather"] } } },
        { name: "replace_ai", selector: { entity: { domain: ["ai_task"] } } },
        { name: "replace_ai_prompt", selector: { text: { multiline: true } } },
        { name: "replace_limit", selector: { number: { min: 1, max: 20, mode: "slider" } } },
      ]},
      // ---- Bouton « Planifier la semaine prochaine » ----
      { type: "expandable", name: "plan_next_section", title: LIBELLES.plan_next_section, schema: [
        { name: "plan_next_enabled", selector: { boolean: {} } },
      ]},
      // ---- Boutons d'action prédéfinis ----
      { type: "expandable", name: "actions_section", title: LIBELLES.actions_section, schema: [
        { name: "action_meal_done", selector: { boolean: {} } },
        { name: "meal_done_service", selector: { text: {} }, default: "" },
        { name: "action_clear_meal", selector: { boolean: {} } },
        { name: "clear_meal_service", selector: { text: {} }, default: "" },
        { name: "action_refresh_shopping", selector: { boolean: {} } },
        { name: "action_send_jow", selector: { boolean: {} } },
        { name: "action_copy_meal", selector: { boolean: {} } },
        { name: "action_favoris", selector: { boolean: {} } },
        { name: "action_rescue", selector: { boolean: {} } },
        { name: "action_import_jow", selector: { boolean: {} } },
        { name: "action_clear_week", selector: { boolean: {} } },
        { name: "action_renew_week", selector: { boolean: {} } },
        { name: "send_jow_mode", selector: { select: { options: ["tabs", "service"] } } },
      ]},
      // ---- Instance & Entités S0 ----
      { type: "expandable", name: "entites", title: LIBELLES.entites,
        schema: [
          { name: "prefix", selector: { text: {} } },
          { name: "entry_name", selector: { text: {} } },
          ...JOURS.map((j) => ({ name: j, selector: { entity: { domain: "sensor" } } })),
        ] },
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

  /** Presets de l'éditeur : au plus 3 presets éditables (nom, critère,
   *  calories/temps max, jours). Les presets au-delà de 3 définis en YAML
   *  sont conservés tels quels. */
  _donneesPresets() {
    const out = {};
    const presets = Array.isArray(this._config.criteria_presets) ? this._config.criteria_presets : [];
    for (let n = 1; n <= 3; n++) {
      const p = presets[n - 1] || {};
      out[`preset_${n}_name`] = p.name || "";
      out[`preset_${n}_criteria`] = p.criteria || "";
      out[`preset_${n}_calories`] = p.max_calories ?? "";
      out[`preset_${n}_time`] = p.max_total_time ?? "";
      out[`preset_${n}_days`] = Array.isArray(p.days) ? p.days : [];
    }
    return out;
  }

  /** Reconstruire criteria_presets depuis les champs de l'éditeur :
   *  un preset n'est conservé que s'il a un critère OU une contrainte
   *  ET au moins un jour. Les jours en doublon entre presets reviennent
   *  au premier preset qui les réclame (ordre de déclaration). */
  _fabriquerPresets(data) {
    const presets = [];
    const claimed = new Set();
    for (let n = 1; n <= 3; n++) {
      const criteria = (data[`preset_${n}_criteria`] || "").trim();
      const cal = data[`preset_${n}_calories`];
      const time = data[`preset_${n}_time`];
      const days = (data[`preset_${n}_days`] || []).filter((j) => {
        if (claimed.has(j)) return false;
        claimed.add(j);
        return true;
      });
      if ((criteria || cal != null || time != null) && days.length) {
        const p = {
          name: (data[`preset_${n}_name`] || "").trim() || criteria || `Preset ${n}`,
          days,
        };
        if (criteria) p.criteria = criteria;
        if (cal != null && cal !== "") p.max_calories = Number(cal);
        if (time != null && time !== "") p.max_total_time = Number(time);
        presets.push(p);
      }
    }
    return presets;
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
      presets_section: this._donneesPresets(),
      replace_section: {
        replace_enabled: !!ra,
        replace_service: ra?.service || "jow.suggest",
        replace_criteria: ra?.data?.criteria || "",
        replace_covers: ra?.data?.covers || 2,
        replace_weather: ra?.data?.weather_entity || "",
        replace_ai: ra?.data?.ai_entity || "",
        replace_ai_prompt: this._config.replace_ai_prompt || "",
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
        action_rescue: (this._config.actions || {}).rescue === true,
        action_import_jow: (this._config.actions || {}).import_jow === true,
        action_clear_week: (this._config.actions || {}).clear_week === true,
        action_renew_week: (this._config.actions || {}).renew_week === true,
        send_jow_mode: (this._config.actions || {}).send_jow_mode || this._config.send_jow_mode || "tabs",
        meal_done_service: (this._config.actions || {}).meal_done_service || "",
        clear_meal_service: (this._config.actions || {}).clear_meal_service || "",
      },
      entites: {
        prefix: this._config.prefix || DEFAUTS.prefix,
        entry_name: this._config.entry_name || "",
        ...ent,
      },
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
        // entry_name (multi-instance) remonte au niveau racine
        const entry_name = (entitesGroupe.entry_name || "").trim();
        const prefix = (entitesGroupe.prefix || "").trim();

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
        const presetsData = v.presets_section || {};
        delete v.replace_section;
        delete v.plan_next_section;
        delete v.actions_section;
        delete v.attributes_section;
        delete v.context_section;
        delete v.presets_section;

        const action = this._fabriquerAction(replaceData);
        const attributes = this._fabriquerAttributes(attrData);
        const actions = {
          meal_done: actionsData.action_meal_done !== false,
          clear_meal: actionsData.action_clear_meal !== false,
          refresh_shopping: actionsData.action_refresh_shopping === true,
          // Boutons optionnels : false n'est PAS émis (le défaut DEFAUTS
          // s'applique côté rendu) — sinon l'éditeur écraserait le défaut
          // true des boutons non-optionnels comme send_jow/copy_meal et
          // les ferait disparaître (le filtre !== false lit actions.*).
          ...(actionsData.action_send_jow === true ? { send_jow: true } : {}),
          ...(actionsData.action_copy_meal === true ? { copy_meal: true } : {}),
          ...(actionsData.action_favoris === true ? { favoris: true } : {}),
          ...(actionsData.action_rescue === true ? { rescue: true } : {}),
          ...(actionsData.action_import_jow === true ? { import_jow: true } : {}),
          ...(actionsData.action_clear_week === true ? { clear_week: true } : {}),
          ...(actionsData.action_renew_week === true ? { renew_week: true } : {}),
          ...(actionsData.send_jow_mode ? { send_jow_mode: actionsData.send_jow_mode } : {}),
        };
        // Services personnalisés (surcharge de jow.* par défaut)
        for (const champ of ["meal_done_service", "clear_meal_service"]) {
          const val = actionsData[champ];
          if (typeof val === "string" && val.trim()) actions[champ] = val.trim();
        }

        // Thèmes par jour + frigo
        const day_themes = {};
        for (const j of JOURS) {
          const val = ctxData[`day_themes_${j}`];
          if (val) day_themes[j] = val;
        }
        const fridge_ingredients = ctxData.fridge_ingredients || "";

        // Presets de critères (choix automatique par jour)
        const criteria_presets = this._fabriquerPresets(presetsData);

        this._emettre({
          type: this._config.type,
          ...v,
          days: Number(v.days) === 1 ? 1 : 7,
          ...(action ? { replace_action: action } : { replace_action: null }),
          ...(planNextData.plan_next_enabled === false ? { plan_next_enabled: false } : {}),
          ...(entities.length === 7 ? { entities } : {}),
          ...(entry_name ? { entry_name } : {}),
          ...(prefix ? { prefix } : {}),
          ...(Object.keys(entitiesS1).some((j) => entitiesS1[j]) ? { entities_s1: entitiesS1 } : {}),
          ...(attributes ? { attributes } : {}),
          ...(Object.keys(day_themes).length ? { day_themes } : {}),
          ...(criteria_presets.length ? { criteria_presets } : {}),
          ...(fridge_ingredients ? { fridge_ingredients } : {}),
          ...(replaceData.replace_ai_prompt ? { replace_ai_prompt: replaceData.replace_ai_prompt } : {}),
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
      <div class="case"><input type="checkbox" id="jc6" data-cle="show_week_calories"${this._config.show_week_calories === true ? " checked" : ""}>
        <label for="jc6">${LIBELLES.show_week_calories}</label></div>
      <div class="case"><input type="checkbox" id="jc7" data-cle="show_month"${this._config.show_month === true ? " checked" : ""}>
        <label for="jc7">${LIBELLES.show_month}</label></div>
      <div class="case"><input type="checkbox" id="jc8" data-cle="plan_next_enabled"${this._config.plan_next_enabled !== false ? " checked" : ""}>
        <label for="jc8">${LIBELLES.plan_next_enabled}</label></div>
      <fieldset><legend>${LIBELLES.context_section}</legend>
        ${JOURS.map((j) => `<label><span class="lib">${LIBELLES[`day_themes_${j}`]}</span>
          <input type="text" data-theme="${j}" value="${this._esc(this._config.day_themes?.[j] || "")}"></label>`).join("")}
        <label><span class="lib">${LIBELLES.fridge_ingredients}</span>
          <input type="text" data-cle="fridge_ingredients" value="${this._esc(this._config.fridge_ingredients || "")}"></label>
      </fieldset>
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
        <label><span class="lib">${LIBELLES.replace_ai_prompt}</span>
          <input type="text" data-cle="replace_ai_prompt" value="${this._esc(this._config.replace_ai_prompt || "")}"></label>
      </fieldset>
      <fieldset><legend>${LIBELLES.actions_section}</legend>
        <div class="case"><input type="checkbox" id="jc9" data-cle="action_meal_done"${(this._config.actions || {}).meal_done !== false ? " checked" : ""}>
          <label for="jc9">${LIBELLES.action_meal_done}</label></div>
        <div class="case"><input type="checkbox" id="jc10" data-cle="action_clear_meal"${(this._config.actions || {}).clear_meal !== false ? " checked" : ""}>
          <label for="jc10">${LIBELLES.action_clear_meal}</label></div>
        <div class="case"><input type="checkbox" id="jc11" data-cle="action_refresh_shopping"${(this._config.actions || {}).refresh_shopping === true ? " checked" : ""}>
          <label for="jc11">${LIBELLES.action_refresh_shopping}</label></div>
        <div class="case"><input type="checkbox" id="jc12" data-cle="action_send_jow"${(this._config.actions || {}).send_jow === true ? " checked" : ""}>
          <label for="jc12">${LIBELLES.action_send_jow}</label></div>
        <div class="case"><input type="checkbox" id="jc13" data-cle="action_copy_meal"${(this._config.actions || {}).copy_meal === true ? " checked" : ""}>
          <label for="jc13">${LIBELLES.action_copy_meal}</label></div>
        <div class="case"><input type="checkbox" id="jc14" data-cle="action_favoris"${(this._config.actions || {}).favoris === true ? " checked" : ""}>
          <label for="jc14">${LIBELLES.action_favoris}</label></div>
        <div class="case"><input type="checkbox" id="jc16" data-cle="action_import_jow"${(this._config.actions || {}).import_jow === true ? " checked" : ""}>
          <label for="jc16">${LIBELLES.action_import_jow}</label></div>
        <div class="case"><input type="checkbox" id="jc17" data-cle="action_clear_week"${(this._config.actions || {}).clear_week === true ? " checked" : ""}>
          <label for="jc17">${LIBELLES.action_clear_week}</label></div>
        <div class="case"><input type="checkbox" id="jc18" data-cle="action_renew_week"${(this._config.actions || {}).renew_week === true ? " checked" : ""}>
          <label for="jc18">${LIBELLES.action_renew_week}</label></div>
        <div class="case"><input type="checkbox" id="jc21" data-cle="action_collections"${(this._config.actions || {}).collections === true ? " checked" : ""}>
          <label for="jc21">${LIBELLES.action_collections}</label></div>
        <label><span class="lib">${LIBELLES.send_jow_mode}</span>
          <select data-cle="send_jow_mode">
            <option value="tabs"${(this._config.send_jow_mode !== "service") ? " selected" : ""}>Ouvrir jow.fr (onglets)</option>
            <option value="service"${(this._config.send_jow_mode === "service") ? " selected" : ""}>Envoyer via jow.send_menu (avec dates)</option>
          </select></label>
      </fieldset>
      <fieldset><legend>${LIBELLES.entites}</legend>
        <label><span class="lib">${LIBELLES.prefix}</span>
          <input type="text" data-cle="prefix" value="${this._esc(this._config.prefix || DEFAUTS.prefix)}"></label>
        <label><span class="lib">${LIBELLES.entry_name}</span>
          <input type="text" data-cle="entry_name" value="${this._esc(this._config.entry_name || "")}"></label>
        ${JOURS.map((j) => `<label><span class="lib">${cap(j)}</span>
          <input type="text" data-entite="${j}" value="${this._esc(ent[j])}"></label>`).join("")}
        ${JOURS.map((j) => `<label><span class="lib">${LIBELLES[`s1${j}`]}</span>
          <input type="text" data-entite-s1="${j}" value="${this._esc((this._config.entities_s1 || {})[j] || `${ent[j]}_s1`)}"></label>`).join("")}
      </fieldset>`;

    this.shadowRoot.querySelectorAll("[data-cle],[data-entite],[data-theme],[data-entite-s1]").forEach((el) => {
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
    const entitiesS1 = {};
    for (const j of JOURS) {
      const v = (R.querySelector(`[data-entite-s1="${j}"]`)?.value || "").trim();
      if (v) entitiesS1[j] = v;
    }
    const day_themes = {};
    for (const j of JOURS) {
      const v = (R.querySelector(`[data-theme="${j}"]`)?.value || "").trim();
      if (v) day_themes[j] = v;
    }
    const actions = (this._config.actions || {});
    const actionBool = (cle, defaut) => {
      const v = lire(cle);
      return v === undefined ? actions[cle.replace("action_", "")] : v;
    };

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

    const prefix = (lire("prefix") || "").trim();
    const entry_name = (lire("entry_name") || "").trim();
    const fridge = (lire("fridge_ingredients") || "").trim();
    const planNext = lire("plan_next_enabled");

    this._emettre({
      type: this._config.type,
      title: lire("title"),
      days: Number(lire("days")) === 1 ? 1 : 7,
      show_calories: lire("show_calories"),
      show_allergens: lire("show_allergens"),
      show_week_calories: lire("show_week_calories"),
      show_month: lire("show_month"),
      ...(action ? { replace_action: action } : { replace_action: null }),
      ...(planNext === false ? { plan_next_enabled: false } : {}),
      ...(prefix && prefix !== DEFAUTS.prefix ? { prefix } : {}),
      ...(entry_name ? { entry_name } : {}),
      ...(fridge ? { fridge_ingredients: fridge } : {}),
      ...(lire("show_cart") ? { show_cart: true } : {}),
      ...(Object.keys(day_themes).length ? { day_themes } : {}),
      ...(Object.keys(entitiesS1).length ? { entities_s1: entitiesS1 } : {}),
      ...(entities.length === 7 ? { entities } : {}),
      actions: {
        meal_done: actionBool("action_meal_done") !== false,
        clear_meal: actionBool("action_clear_meal") !== false,
        refresh_shopping: actionBool("action_refresh_shopping") === true,
        // Boutons optionnels : false non émis (le défaut s'applique côté
        // rendu) — même correction que l'éditeur ha-form.
        ...(actionBool("action_send_jow") === true ? { send_jow: true } : {}),
        ...(actionBool("action_copy_meal") === true ? { copy_meal: true } : {}),
        ...(actionBool("action_favoris") === true ? { favoris: true } : {}),
        ...(actionBool("action_rescue") === true ? { rescue: true } : {}),
        ...(actionBool("action_import_jow") === true ? { import_jow: true } : {}),
        ...(lire("send_jow_mode") === "service" ? { send_jow_mode: "service" } : {}),
      },
    });
  }

  _esc(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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