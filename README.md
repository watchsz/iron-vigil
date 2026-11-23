# Iron Vigil

Tower defense 3D, rendu PSX, dark fantasy. Plan complet : [PLAN.md](PLAN.md).

Tout tourne dans Docker :

```sh
docker compose up dev            # jeu en dev → http://localhost:5173
docker compose run --rm test     # typecheck + tests unitaires
docker compose run --rm --build e2e   # tests Playwright (rapport dans playwright-report/)
docker compose up --build web    # build de prod nginx → http://localhost:8090
```
