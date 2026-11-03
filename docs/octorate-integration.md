# Préparation de l'intégration Octorate

État : **préparé, non activé**. Les boutons « Réserver » mènent au formulaire de contact.

## Ce qui est en place
- `src/components/BookButton.astro` : lien vers Octorate si activé et URL en `https://`, sinon `/contact/`.
- Réglage dans `/admin` > Réglages > Réservation Octorate (case + lien). Rien à redéployer.

## À obtenir (Stéphane F.)
1. Le lien du moteur de réservation Octorate de l'établissement (Octobook / « Booking Engine »), visible dans le back-office Octorate.
2. Le devis Octorate (migration complète depuis HotePMS/Ops : réservations, planning, facturation, caisse).
3. Seulement si on veut afficher disponibilités/tarifs sur le site : demander à Octorate un accès API. Inutile pour la V1 (redirection simple).

## Bascule
1. Tester le lien dans un navigateur.
2. `/admin` > Réglages : coller le lien, cocher « Activer », enregistrer.
3. Vérifier les boutons Réserver (en-tête, accueil, pages chambres, tarifs).

## Sécurité
Ne jamais mettre d'identifiant, de mot de passe ou de clé API Octorate dans le dépôt ni dans un document partagé. Changer le mot de passe Octorate qui apparaît en clair dans les notes de réunion.
