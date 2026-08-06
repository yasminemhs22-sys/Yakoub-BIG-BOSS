/**
 * UI strings only.
 *
 * Everything a customer reads about products, categories, pages and policies
 * comes from the database (D-130). This file holds the words the interface
 * itself needs: buttons, labels, states, errors.
 *
 * Voice: plain verbs, sentence case, no filler. A control says exactly what
 * happens when it is used, and keeps the same word through the whole flow.
 */
export const fr = {
  common: {
    loading: 'Chargement',
    retry: 'Réessayer',
    close: 'Fermer',
    back: 'Retour',
    search: 'Rechercher',
    cancel: 'Annuler',
    save: 'Enregistrer',
  },
  nav: {
    home: 'Accueil',
    shop: 'Boutique',
    newArrivals: 'Nouveautés',
    promotions: 'Promotions',
    trackOrder: 'Suivre ma commande',
    contact: 'Contact',
    menu: 'Menu',
    cart: 'Panier',
  },
  language: {
    switch: 'Langue',
    fr: 'Français',
    ar: 'العربية',
  },
  product: {
    addToCart: 'Ajouter au panier',
    orderNow: 'Commander',
    orderViaWhatsapp: 'Commander sur WhatsApp',
    inStock: 'En stock',
    lastUnits: 'Plus que {count}',
    outOfStock: 'Rupture de stock',
    chooseColor: 'Couleur',
    chooseSize: 'Taille',
    sizeGuide: 'Guide des tailles',
    care: 'Entretien',
    description: 'Description',
    related: 'Vous aimerez aussi',
  },
  delivery: {
    estimate: 'Frais de livraison',
    chooseWilaya: 'Choisir la wilaya',
    chooseCommune: 'Choisir la commune',
    bureau: 'Bureau',
    domicile: 'À domicile',
    coverage: 'Livraison dans les 58 wilayas',
  },
  cart: {
    title: 'Panier',
    empty: 'Votre panier est vide.',
    emptyAction: 'Voir la boutique',
    subtotal: 'Sous-total',
    deliveryFee: 'Livraison',
    total: 'Total',
    checkout: 'Passer la commande',
    remove: 'Retirer',
    quantity: 'Quantité',
  },
  checkout: {
    title: 'Vos informations',
    firstName: 'Prénom',
    lastName: 'Nom',
    phone: 'Téléphone',
    address: 'Adresse',
    notes: 'Remarques',
    notesHint: 'Facultatif',
    submit: 'Confirmer la commande',
    payOnDelivery: 'Paiement à la livraison',
  },
  errors: {
    invalidPhone: 'Numéro de téléphone algérien invalide. Exemple : 0563876210',
    requiredField: 'Ce champ est obligatoire',
    addressRequired: "L'adresse est obligatoire pour la livraison à domicile",
    noDeliveryPrice: "Aucun tarif de livraison n'est défini pour cette wilaya",
    rateLimited: 'Trop de tentatives. Réessayez dans une heure.',
    duplicate: 'Une commande vient déjà d’être enregistrée avec ce numéro.',
    generic: "La commande n'a pas pu être enregistrée. Réessayez.",
    notFound: 'Page introuvable',
    notFoundAction: "Revenir à l'accueil",
  },
  orderStatus: {
    confirmationCall: 'Nous vous appelons pour confirmer votre commande.',
    reference: 'Numéro de commande',
    trackTitle: 'Suivre ma commande',
    trackHint: 'Entrez votre numéro de commande et votre téléphone.',
    trackNotFound: 'Aucune commande ne correspond à ces informations.',
  },
};

/**
 * The shape both dictionaries must satisfy.
 *
 * NOTE: no `as const` here, deliberately. `as const` would freeze every value
 * into a string LITERAL type — 'Accueil' rather than string — and then no
 * Arabic translation would be assignable to it. Keys stay fixed; values are
 * ordinary strings.
 */
export type Dictionary = typeof fr;
