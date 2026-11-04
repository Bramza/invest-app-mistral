# invest-app-mistral

## InvestTrack — Python-portfolio-webapp

Een professionele webapp om je investeringen (aandelen, ETF's, crypto, obligaties, grondstoffen) bij te houden, met een dashboard-overzicht: totale waarde, winst/verlies, waardeverloop en allocatie.

## Starten

Geen externe packages nodig — alleen de Python-standaardbibliotheek:

```bash
cd invest-app
python3 app.py
```

Open daarna **http://localhost:8000** in je browser.

## Functies

- **Dashboard** — totale waarde, geïnvesteerd bedrag, winst/verlies (absoluut + %), aantal posities, interactieve waardeverloop-grafiek en allocatie-donut.
- **Beleggingen** — beholdingen toevoegen, bewerken en verwijderen (met tweestaps-bevestiging) in een overzichtelijke tabel.
- **Contant** — vrij saldo beheren; telt mee in de totale portfolio-waarde.
- **Markt simuleren** — laat koersen realistisch bewegen (random walk) en voegt een punt toe aan het waardeverloop.
- Data wordt opgeslagen in `data/portfolio.json`. Bij de eerste start wordt automatisch voorbeelddata aangemaakt.

## API

| Methode | Pad | Beschrijving |
| --- | --- | --- |
| GET | `/api/portfolio` | Volledig overzicht (totals, beholdingen, geschiedenis) |
| POST | `/api/holdings` | Nieuwe belegging toevoegen |
| PUT | `/api/holdings/<id>` | Belegging bijwerken |
| DELETE | `/api/holdings/<id>` | Belegging verwijderen |
| POST | `/api/cash` | Contant saldo instellen (`{"amount": 1000}`) |
| POST | `/api/simulate` | Koersen simuleren + geschiedenis bijwerken |

## Structuur

```
invest-app/
├── app.py                  # backend (http.server, REST API, JSON-opslag)
├── static/
│   ├── index.html          # pagina-structuur
│   ├── styles.css          # design system
│   └── app.js              # rendering, grafieken, interacties
└── data/portfolio.json     # wordt automatisch aangemaakt
```
