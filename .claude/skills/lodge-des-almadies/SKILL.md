---
name: lodge-des-almadies
description: Contexte et règles de marque du Lodge des Almadies (hôtel 3 étoiles, Dakar). À utiliser pour tout travail sur l'hôtel - site web, textes, emails clients, réseaux sociaux, séminaires, restaurant L'ENVERS, boutiques, réservations Octorate, tarifs. Mots-clés - lodge, almadies, hôtel, Dakar, séminaire, L'ENVERS, Octorate.
---

# Le Lodge des Almadies

## Faits de base (source : `src/data/content.default.json`)
- Hôtel 3 étoiles, **36 chambres et suites** dans 2 bâtiments (côté route ou côté piscine).
- Adresse : Route de l'OCI, Almadies, Dakar, Sénégal. À environ 15 min du centre-ville.
- Contact : hotel@lodgedesalmadies.com, (+221) 33 869 03 45.
- Types de chambres : suites, doubles, twin.
- **Restaurant L'ENVERS** : cuisine européenne et africaine, service continu, bar ouvert toute la journée.
- **Boutiques** : LAPESCHARDIÈRE (bijoux faits main), ZAMANI (créateurs et produits africains).
- **Séminaires** : salle de 70 m², 40 personnes, climatisée, vidéoprojecteur.
- Fiche TripAdvisor et Google Maps : liens dans le fichier de contenu.

## Tarifs
Ne jamais recopier ni inventer un prix de mémoire. Lire les tarifs actuels dans le fichier de contenu
ci-dessus et dans `src/pages/tarifs/`, et signaler tout écart entre le site et ce que dit l'utilisateur.

## Ton et marque
- Mots-clés de marque : calme, propreté, accueil chaleureux, atmosphère raffinée et familiale, oasis de sérénité.
- Langue par défaut : français soigné. Vouvoiement avec les clients. Anglais sur demande.
- Pas de superlatifs creux ni de promesses non vérifiées (étoiles, certifications, équipements).

## Site web
- Projet Astro 5 déployé sur Vercel (ce dépôt). Contenu éditable dans /admin.
- Bouton « Réserver » : composant `src/components/BookButton.astro`. Il pointe vers Octorate si activé, sinon vers /contact/.
- Intégration Octorate : préparée, **non activée** (voir `docs/octorate-integration.md`). Ne pas l'activer sans le lien du
  moteur de réservation validé par le propriétaire.

## Règles de sécurité
- Jamais d'identifiant, mot de passe ou clé API (Octorate, admin) dans le code, un document ou une réponse.
- Données clients (noms, emails, téléphones) : ne pas les copier hors du contexte de la demande.

## Quel agent utiliser (s'ils sont disponibles dans la session)
- Accueil, réponses clients : `hospitality-guest-services`
- Textes, emails, SEO, réseaux : `marketing-content-creator`, `marketing-email-strategist`, `marketing-seo-specialist`, `marketing-instagram-curator`
- Séminaires, tarifs : `specialized-pricing-analyst`
- Site : `engineering-frontend-developer`, `engineering-backend-architect`
