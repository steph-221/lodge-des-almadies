---
nom: lodge-des-almadies
repo: steph-221/lodge-des-almadies
type: app web
client: Lodge des Almadies (hôtel 3 étoiles, Dakar)
hebergement: [Vercel, Neon]
prod: https://lodge-des-almadies.vercel.app
staging:
projet: lodge
local: C:\Sites et APP\hotel lodges des almadies\site
claude_projet: VERCEL HOTEL LODGE DES ALMADIES (cible : Lodge des Almadies)
env_local: hotel lodge almadies
env_cloud:
ssh:
vercel: cabinet-cardio-mesnana/lodge-des-almadies
neon: quiet-haze-05424490
---
# lodge-des-almadies

Site de l'hôtel Lodge des Almadies (Dakar), avec un module « services hôtel » (ménage, linge, stocks, minibar, visites de chambre, demandes clients par QR code, alertes WhatsApp, e-mail du matin).

## Environnement de travail
- Dossier local : `C:\Sites et APP\hotel lodges des almadies\site` (branche `feat/services-hotel-lot3b`)
- Projet Claude : « VERCEL HOTEL LODGE DES ALMADIES » ; environnement local « hotel lodge almadies » ; pas d'environnement cloud
- Skills du projet : `deploy`, `lodge-des-almadies`, `preuve-visuelle`, `prod-check` (dans `.claude/skills`)
- Chaîne : local → GitHub → Vercel (aperçu par branche) ; Neon `lodge-des-almadies`

## Stack
- Astro `^5.0.0`

## Hébergement & déploiement
- Hébergeur : Vercel, Neon
- GitHub Actions (ci.yml)
- Vercel (déploiement auto sur push)
- Déploiement : Push sur `main` : Vercel déploie ; CI GitHub (build) à chaque pull request

## Liens
| Quoi | URL |
|---|---|
| Dépôt | https://github.com/steph-221/lodge-des-almadies |
| Production | https://lodge-des-almadies.vercel.app (l'ancien site PHP lodgedesalmadies.com n'est pas encore basculé) |
| Admin / back-office | https://lodge-des-almadies.vercel.app/admin/ |
| Console hébergeur | https://vercel.com/cabinet-cardio-mesnana/lodge-des-almadies · Neon : https://console.neon.tech/app/projects/quiet-haze-05424490 |

## Variables d'environnement
> Noms uniquement. Les valeurs restent chez l'hébergeur ou dans le gestionnaire de mots de passe.

| Nom | Où est stockée la valeur |
|---|---|
| `ADMIN_PASSWORD` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `BLOB_READ_WRITE_TOKEN` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `CONTACT_FROM` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `CRON_SECRET` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `DATABASE_URL` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `DATABASE_URL_UNPOOLED` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `PUBLIC_APP_ORIGIN` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `PUBLIC_TURNSTILE_SITEKEY` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `RESEND_API_KEY` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `SESSION_SECRET` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `STAFF_PEPPER` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `TURNSTILE_SECRET` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `WHATSAPP_PHONE_ID` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `WHATSAPP_TEMPLATE` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `WHATSAPP_TEMPLATE_LANG` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |
| `WHATSAPP_TOKEN` | Vercel › Settings › Environment Variables (équipe cabinet-cardio-mesnana) |

Secrets GitHub Actions : aucun détecté

## Accès SSH
Aucun (déploiement par plateforme).

## Docs existantes dans le repo
aucune

## Points d'attention
- Domaine `lodgedesalmadies.com` : ancien site PHP 7.4 (LiteSpeed), DNS « dns-parking.com », pas encore basculé sur Vercel : bascule prévue en janvier 2027.
- Réservations Octorate : https://admin.octorate.com (pas relié au site pour le moment, confirmé le 22/11).
- Branche Neon par aperçu Vercel : pas en place (registre, étape 5).
- Alertes WhatsApp (lot 3b) et e-mail du matin : pas encore actifs en production (22/11).
