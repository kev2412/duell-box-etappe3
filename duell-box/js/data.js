// data.js – deutschsprachiger Content.
// Inhalte aller vier Spiele: Stadt-Land-Fluss, Schätz-Duell, 5-Sekunden-Sprint, Wer wird Millionär?.

export const SLF_LETTERS = 'ABCDEFGHIJKLMNOPRSTUVWZ'.split(''); // ohne Q, X, Y

export const SLF_SETS = [
  {
    id: 'klassisch',
    title: 'Klassisch',
    tone: 'classic',
    categories: ['Stadt', 'Land', 'Fluss', 'Name', 'Tier', 'Beruf'],
  },
  {
    id: 'kreativ',
    title: 'Kreativ / Lustig',
    tone: 'creative',
    categories: ['Ausrede', 'Spitzname', 'Essen', 'Superkraft', 'Ding im Badezimmer', 'Hobby'],
  },
];

/* ------------------------------------------------------------------ */
/* Schätz-Duell: { id, frage, wert, einheit }                          */
/* Regeln: IDs eindeutig und stabil (der Host sendet IDs, nicht Texte); */
/* Rundungen stehen in der Frage; höchstens 2 Nachkommastellen, weil   */
/* "1.234" bei der Eingabe als Tausenderpunkt gilt (siehe schaetzen.js).*/
/* ------------------------------------------------------------------ */

export const SCHAETZ_FRAGEN = [
  // Höhen, Längen, Tiefen (Meter)
  { id: 'zugspitze', frage: 'Wie hoch ist die Zugspitze, Deutschlands höchster Berg?', wert: 2962, einheit: 'Meter' },
  { id: 'matterhorn', frage: 'Wie hoch ist das Matterhorn?', wert: 4478, einheit: 'Meter' },
  { id: 'everest', frage: 'Wie hoch ist der Mount Everest (Messung von 2020)?', wert: 8849, einheit: 'Meter' },
  { id: 'grossglockner', frage: 'Wie hoch ist der Großglockner, Österreichs höchster Berg?', wert: 3798, einheit: 'Meter' },
  { id: 'koelner-dom', frage: 'Wie hoch ist der höhere Turm des Kölner Doms (auf ganze Meter gerundet)?', wert: 157, einheit: 'Meter' },
  { id: 'fernsehturm', frage: 'Wie hoch ist der Berliner Fernsehturm mit Antenne (auf ganze Meter gerundet)?', wert: 368, einheit: 'Meter' },
  { id: 'burj-khalifa', frage: 'Wie hoch ist der Burj Khalifa in Dubai?', wert: 828, einheit: 'Meter' },
  { id: 'cheops', frage: 'Wie hoch war die Cheops-Pyramide ursprünglich (auf eine Nachkommastelle gerundet)?', wert: 146.6, einheit: 'Meter' },
  { id: 'titanic-laenge', frage: 'Wie lang war die Titanic (auf ganze Meter gerundet)?', wert: 269, einheit: 'Meter' },
  { id: 'angel-falls', frage: 'Wie hoch ist der Salto Ángel in Venezuela, der höchste Wasserfall der Erde?', wert: 979, einheit: 'Meter' },
  { id: 'baikalsee', frage: 'Wie tief ist der Baikalsee an seiner tiefsten Stelle?', wert: 1642, einheit: 'Meter' },
  { id: 'golden-gate', frage: 'Wie lang ist die Hauptspannweite der Golden Gate Bridge (auf ganze Meter gerundet)?', wert: 1280, einheit: 'Meter' },
  { id: 'marathon', frage: 'Wie lang ist ein Marathonlauf?', wert: 42195, einheit: 'Meter' },
  { id: 'weitsprung-rekord', frage: 'Wie weit sprang Mike Powell 1991 beim bis heute gültigen Weitsprung-Weltrekord der Männer?', wert: 8.95, einheit: 'Meter' },

  // Entfernungen und Längen (Kilometer)
  { id: 'rhein', frage: 'Wie lang ist der Rhein (auf ganze Kilometer gerundet)?', wert: 1233, einheit: 'Kilometer' },
  { id: 'elbe', frage: 'Wie lang ist die Elbe von der Quelle bis zur Mündung?', wert: 1094, einheit: 'Kilometer' },
  { id: 'erde-mond', frage: 'Wie weit ist der Mond im Durchschnitt von der Erde entfernt (auf Hunderter gerundet)?', wert: 384400, einheit: 'Kilometer' },
  { id: 'erde-sonne', frage: 'Wie weit ist die Erde im Durchschnitt von der Sonne entfernt (auf eine Nachkommastelle gerundet)?', wert: 149.6, einheit: 'Millionen Kilometer' },
  { id: 'erddurchmesser', frage: 'Wie groß ist der mittlere Durchmesser der Erde (auf ganze Kilometer gerundet)?', wert: 12742, einheit: 'Kilometer' },
  { id: 'gotthard', frage: 'Wie lang ist der Gotthard-Basistunnel (auf eine Nachkommastelle gerundet)?', wert: 57.1, einheit: 'Kilometer' },
  { id: 'berliner-mauer', frage: 'Wie lang waren die Grenzanlagen rund um West-Berlin?', wert: 155, einheit: 'Kilometer' },

  // Jahreszahlen
  { id: 'mauerfall', frage: 'In welchem Jahr fiel die Berliner Mauer?', wert: 1989, einheit: 'Jahreszahl' },
  { id: 'mondlandung', frage: 'In welchem Jahr betraten die ersten Menschen den Mond?', wert: 1969, einheit: 'Jahreszahl' },
  { id: 'titanic-untergang', frage: 'In welchem Jahr sank die Titanic?', wert: 1912, einheit: 'Jahreszahl' },
  { id: 'kolumbus', frage: 'In welchem Jahr erreichte Christoph Kolumbus erstmals Amerika?', wert: 1492, einheit: 'Jahreszahl' },
  { id: 'franzoesische-revolution', frage: 'In welchem Jahr begann die Französische Revolution?', wert: 1789, einheit: 'Jahreszahl' },
  { id: 'iphone', frage: 'In welchem Jahr wurde das erste iPhone vorgestellt?', wert: 2007, einheit: 'Jahreszahl' },
  { id: 'euro-bargeld', frage: 'In welchem Jahr wurden Euro-Münzen und -Scheine eingeführt?', wert: 2002, einheit: 'Jahreszahl' },
  { id: 'tschernobyl', frage: 'In welchem Jahr ereignete sich die Reaktorkatastrophe von Tschernobyl?', wert: 1986, einheit: 'Jahreszahl' },
  { id: 'mauerbau', frage: 'In welchem Jahr begann der Bau der Berliner Mauer?', wert: 1961, einheit: 'Jahreszahl' },
  { id: 'thesenanschlag', frage: 'In welchem Jahr veröffentlichte Martin Luther seine 95 Thesen?', wert: 1517, einheit: 'Jahreszahl' },
  { id: 'dom-fertig', frage: 'In welchem Jahr wurde der Kölner Dom nach über 600 Jahren Bauzeit vollendet?', wert: 1880, einheit: 'Jahreszahl' },

  // Zeiträume
  { id: 'hundertjaehriger-krieg', frage: 'Wie viele Jahre dauerte der „Hundertjährige Krieg“ tatsächlich?', wert: 116, einheit: 'Jahre' },
  { id: 'elizabeth-regentschaft', frage: 'Wie viele Jahre regierte Queen Elizabeth II. (auf ganze Jahre abgerundet)?', wert: 70, einheit: 'Jahre' },
  { id: 'erdalter', frage: 'Wie alt ist die Erde?', wert: 4.54, einheit: 'Milliarden Jahre' },
  { id: 'universum-alter', frage: 'Wie alt ist das Universum (auf eine Nachkommastelle gerundet)?', wert: 13.8, einheit: 'Milliarden Jahre' },
  { id: 'mars-umlauf', frage: 'Wie viele Erdtage braucht der Mars für einen Umlauf um die Sonne?', wert: 687, einheit: 'Tage' },

  // Gewichte
  { id: 'dicker-pitter', frage: 'Wie schwer ist die Petersglocke („Dicker Pitter“) im Kölner Dom?', wert: 24, einheit: 'Tonnen' },
  { id: 'big-ben-glocke', frage: 'Wie schwer ist die Glocke „Big Ben“ in London (auf eine Nachkommastelle gerundet)?', wert: 13.7, einheit: 'Tonnen' },
  { id: 'eu-staaten', frage: 'Wie viele Mitgliedstaaten hat die Europäische Union (Stand nach dem Brexit)?', wert: 27, einheit: 'Staaten' },

  // Anzahlen und Rekorde
  { id: 'knochen', frage: 'Wie viele Knochen hat ein erwachsener Mensch?', wert: 206, einheit: 'Knochen' },
  { id: 'klaviertasten', frage: 'Wie viele Tasten hat ein Standard-Klavier?', wert: 88, einheit: 'Tasten' },
  { id: 'primzahlen', frage: 'Wie viele Primzahlen gibt es unter 100?', wert: 25, einheit: 'Primzahlen' },
  { id: 'zaehne', frage: 'Wie viele Zähne hat ein vollständiges Erwachsenengebiss (mit Weisheitszähnen)?', wert: 32, einheit: 'Zähne' },
  { id: 'bolt-rekord', frage: 'Welche Zeit lief Usain Bolt 2009 beim Weltrekord über 100 Meter?', wert: 9.58, einheit: 'Sekunden' },
];

/* ------------------------------------------------------------------ */
/* 5-Sekunden-Sprint: { id, text }, alle im Format „Nenne 3 …“         */
/* ------------------------------------------------------------------ */

export const SPRINT_AUFGABEN = [
  { id: 'automarken', text: 'Nenne 3 Automarken' },
  { id: 'obstsorten', text: 'Nenne 3 Obstsorten' },
  { id: 'gemuesesorten', text: 'Nenne 3 Gemüsesorten' },
  { id: 'hunderassen', text: 'Nenne 3 Hunderassen' },
  { id: 'hauptstaedte', text: 'Nenne 3 Hauptstädte in Europa' },
  { id: 'fluesse-deutschland', text: 'Nenne 3 Flüsse in Deutschland' },
  { id: 'musikinstrumente', text: 'Nenne 3 Musikinstrumente' },
  { id: 'ballsportarten', text: 'Nenne 3 Sportarten mit einem Ball' },
  { id: 'wassertiere', text: 'Nenne 3 Tiere, die im Wasser leben' },
  { id: 'gewuerze', text: 'Nenne 3 Gewürze' },
  { id: 'kaesesorten', text: 'Nenne 3 Käsesorten' },
  { id: 'pizzabelaege', text: 'Nenne 3 Pizzabeläge' },
  { id: 'suessigkeiten', text: 'Nenne 3 Süßigkeiten' },
  { id: 'getraenke', text: 'Nenne 3 Getränke ohne Alkohol' },
  { id: 'krankenhaus-berufe', text: 'Nenne 3 Berufe im Krankenhaus' },
  { id: 'uniform-berufe', text: 'Nenne 3 Berufe mit Uniform' },
  { id: 'badezimmer', text: 'Nenne 3 Dinge im Badezimmer' },
  { id: 'kueche', text: 'Nenne 3 Dinge in einer Küche' },
  { id: 'rucksack', text: 'Nenne 3 Dinge, die man im Rucksack hat' },
  { id: 'rote-dinge', text: 'Nenne 3 Dinge, die rot sind' },
  { id: 'kuehlschrank', text: 'Nenne 3 Dinge, die im Kühlschrank liegen' },
  { id: 'schulfaecher', text: 'Nenne 3 Schulfächer' },
  { id: 'bundeslaender', text: 'Nenne 3 deutsche Bundesländer' },
  { id: 'nachbarlaender', text: 'Nenne 3 Nachbarländer von Deutschland' },
  { id: 'kontinente', text: 'Nenne 3 Kontinente' },
  { id: 'planeten', text: 'Nenne 3 Planeten unseres Sonnensystems' },
  { id: 'zweiraeder', text: 'Nenne 3 Fahrzeuge mit zwei Rädern' },
  { id: 'bauernhoftiere', text: 'Nenne 3 Tiere auf einem Bauernhof' },
  { id: 'afrika-tiere', text: 'Nenne 3 Tiere, die in Afrika leben' },
  { id: 'voegel', text: 'Nenne 3 Vogelarten' },
  { id: 'insekten', text: 'Nenne 3 Insekten' },
  { id: 'blumen', text: 'Nenne 3 Blumen' },
  { id: 'baeume', text: 'Nenne 3 Baumarten' },
  { id: 'wintersport', text: 'Nenne 3 Wintersportarten' },
  { id: 'sommer', text: 'Nenne 3 Dinge, die man im Sommer macht' },
  { id: 'social-media', text: 'Nenne 3 Social-Media-Apps' },
  { id: 'brettspiele', text: 'Nenne 3 Brettspiele' },
  { id: 'kartenspiele', text: 'Nenne 3 Kartenspiele' },
  { id: 'geburtstag', text: 'Nenne 3 Dinge, die man auf einer Geburtstagsparty braucht' },
  { id: 'b-woerter', text: 'Nenne 3 Wörter, die mit B anfangen' },
  { id: 'runde-dinge', text: 'Nenne 3 Dinge, die rund sind' },
  { id: 'kartoffelgerichte', text: 'Nenne 3 Gerichte mit Kartoffeln' },
  { id: 'aufladen', text: 'Nenne 3 Dinge, die man aufladen muss' },
  { id: 'kopf-koerperteile', text: 'Nenne 3 Körperteile am Kopf' },
  { id: 'schwimmen', text: 'Nenne 3 Dinge, die auf dem Wasser schwimmen' },
];

/* ------------------------------------------------------------------ */
/* Wer wird Millionär?: { id, level 1–10, frage, optionen[4], richtig 0–3 } */
/* 5 Fragen je Stufe, Schwierigkeit steigt von Stufe 1 bis 10.          */
/* ------------------------------------------------------------------ */

export const QUIZ_FRAGEN = [
  { id: "l1-1", level: 1, frage: "Welche Farbe entsteht, wenn man Blau und Gelb mischt?", optionen: ["Orange", "Lila", "Grün", "Braun"], richtig: 2 },
  { id: "l1-2", level: 1, frage: "Wie viele Tage hat eine Woche?", optionen: ["7", "5", "6", "8"], richtig: 0 },
  { id: "l1-3", level: 1, frage: "Welches Tier wird als „König der Tiere“ bezeichnet?", optionen: ["Tiger", "Löwe", "Bär", "Elefant"], richtig: 1 },
  { id: "l1-4", level: 1, frage: "Wie heißt die Hauptstadt von Deutschland?", optionen: ["München", "Hamburg", "Köln", "Berlin"], richtig: 3 },
  { id: "l1-5", level: 1, frage: "Welches Obst ist gelb und krumm?", optionen: ["Apfel", "Birne", "Banane", "Kirsche"], richtig: 2 },
  { id: "l2-1", level: 2, frage: "Wie viele Beine hat eine Spinne?", optionen: ["6", "10", "12", "8"], richtig: 3 },
  { id: "l2-2", level: 2, frage: "In welchem Land steht der Eiffelturm?", optionen: ["Italien", "Spanien", "Belgien", "Frankreich"], richtig: 3 },
  { id: "l2-3", level: 2, frage: "Wie heißt der größte Planet unseres Sonnensystems?", optionen: ["Saturn", "Neptun", "Jupiter", "Erde"], richtig: 2 },
  { id: "l2-4", level: 2, frage: "Welches Gas brauchen Menschen zum Atmen?", optionen: ["Sauerstoff", "Helium", "Wasserstoff", "Methan"], richtig: 0 },
  { id: "l2-5", level: 2, frage: "Wie viele Minuten hat eine Stunde?", optionen: ["30", "45", "100", "60"], richtig: 3 },
  { id: "l3-1", level: 3, frage: "Wer malte die „Mona Lisa“?", optionen: ["Michelangelo", "Raffael", "Leonardo da Vinci", "Rembrandt"], richtig: 2 },
  { id: "l3-2", level: 3, frage: "Welcher Fluss fließt durch Köln?", optionen: ["Elbe", "Rhein", "Donau", "Weser"], richtig: 1 },
  { id: "l3-3", level: 3, frage: "Wie nennt man ein Tier, das nur Pflanzen frisst?", optionen: ["Pflanzenfresser", "Fleischfresser", "Allesfresser", "Aasfresser"], richtig: 0 },
  { id: "l3-4", level: 3, frage: "Wie lautet die chemische Formel für Wasser?", optionen: ["CO₂", "H₂O", "O₂", "NaCl"], richtig: 1 },
  { id: "l3-5", level: 3, frage: "Welcher Kontinent ist der größte?", optionen: ["Afrika", "Europa", "Nordamerika", "Asien"], richtig: 3 },
  { id: "l4-1", level: 4, frage: "Wer schrieb das Drama „Faust“?", optionen: ["Friedrich Schiller", "Gotthold Ephraim Lessing", "Johann Wolfgang von Goethe", "Bertolt Brecht"], richtig: 2 },
  { id: "l4-2", level: 4, frage: "Wie heißt die Hauptstadt von Australien?", optionen: ["Sydney", "Melbourne", "Perth", "Canberra"], richtig: 3 },
  { id: "l4-3", level: 4, frage: "Wie viele Spieler einer Mannschaft stehen beim Fußball gleichzeitig auf dem Feld?", optionen: ["11", "9", "10", "12"], richtig: 0 },
  { id: "l4-4", level: 4, frage: "Welches Element hat das chemische Symbol „Fe“?", optionen: ["Fluor", "Blei", "Zinn", "Eisen"], richtig: 3 },
  { id: "l4-5", level: 4, frage: "Welches Land hat auf der Landkarte die Form eines Stiefels?", optionen: ["Spanien", "Italien", "Griechenland", "Portugal"], richtig: 1 },
  { id: "l5-1", level: 5, frage: "Wer entwickelte die Relativitätstheorie?", optionen: ["Isaac Newton", "Albert Einstein", "Niels Bohr", "Max Planck"], richtig: 1 },
  { id: "l5-2", level: 5, frage: "Wie heißt die Hauptstadt von Kanada?", optionen: ["Ottawa", "Toronto", "Vancouver", "Montreal"], richtig: 0 },
  { id: "l5-3", level: 5, frage: "Welcher Planet ist der Sonne am nächsten?", optionen: ["Merkur", "Venus", "Mars", "Erde"], richtig: 0 },
  { id: "l5-4", level: 5, frage: "Wie viele Bundesländer hat Deutschland?", optionen: ["14", "15", "16", "17"], richtig: 2 },
  { id: "l5-5", level: 5, frage: "Welcher Komponist schrieb die „Mondscheinsonate“?", optionen: ["Wolfgang Amadeus Mozart", "Ludwig van Beethoven", "Johann Sebastian Bach", "Joseph Haydn"], richtig: 1 },
  { id: "l6-1", level: 6, frage: "Welches ist das größte Organ des Menschen?", optionen: ["Haut", "Leber", "Lunge", "Herz"], richtig: 0 },
  { id: "l6-2", level: 6, frage: "In welchem Jahr begann der Erste Weltkrieg?", optionen: ["1914", "1912", "1916", "1918"], richtig: 0 },
  { id: "l6-3", level: 6, frage: "Wie heißt die Währung Japans?", optionen: ["Won", "Yuan", "Rupie", "Yen"], richtig: 3 },
  { id: "l6-4", level: 6, frage: "Wer war der erste Bundeskanzler der Bundesrepublik Deutschland?", optionen: ["Konrad Adenauer", "Willy Brandt", "Ludwig Erhard", "Helmut Schmidt"], richtig: 0 },
  { id: "l6-5", level: 6, frage: "Wie heißt die Hauptstadt der Türkei?", optionen: ["Istanbul", "Izmir", "Ankara", "Antalya"], richtig: 2 },
  { id: "l7-1", level: 7, frage: "Welcher Schriftsteller erschuf die Figur Sherlock Holmes?", optionen: ["Arthur Conan Doyle", "Agatha Christie", "Charles Dickens", "Edgar Allan Poe"], richtig: 0 },
  { id: "l7-2", level: 7, frage: "Welcher Staat ist flächenmäßig der kleinste der Erde?", optionen: ["Monaco", "Vatikanstadt", "San Marino", "Liechtenstein"], richtig: 1 },
  { id: "l7-3", level: 7, frage: "Welches chemische Element hat die Ordnungszahl 1?", optionen: ["Helium", "Sauerstoff", "Wasserstoff", "Kohlenstoff"], richtig: 2 },
  { id: "l7-4", level: 7, frage: "In welchem Jahr wurde die Bundesrepublik Deutschland gegründet?", optionen: ["1945", "1949", "1955", "1961"], richtig: 1 },
  { id: "l7-5", level: 7, frage: "Welcher Maler schuf das Gemälde „Sternennacht“?", optionen: ["Claude Monet", "Vincent van Gogh", "Paul Cézanne", "Edvard Munch"], richtig: 1 },
  { id: "l8-1", level: 8, frage: "Wie heißt die Hauptstadt von Neuseeland?", optionen: ["Auckland", "Christchurch", "Hamilton", "Wellington"], richtig: 3 },
  { id: "l8-2", level: 8, frage: "Wer schrieb die „Kritik der reinen Vernunft“?", optionen: ["Georg Wilhelm Friedrich Hegel", "Arthur Schopenhauer", "Immanuel Kant", "Friedrich Nietzsche"], richtig: 2 },
  { id: "l8-3", level: 8, frage: "Wie nennt man die Lehre von den Pilzen?", optionen: ["Mikrobiologie", "Dendrologie", "Mykologie", "Zoologie"], richtig: 2 },
  { id: "l8-4", level: 8, frage: "Welcher Fluss ist der längste Europas?", optionen: ["Donau", "Rhein", "Wolga", "Dnepr"], richtig: 2 },
  { id: "l8-5", level: 8, frage: "Wer komponierte die Oper „Die Zauberflöte“?", optionen: ["Giuseppe Verdi", "Richard Wagner", "Ludwig van Beethoven", "Wolfgang Amadeus Mozart"], richtig: 3 },
  { id: "l9-1", level: 9, frage: "In welchem Jahr wurde der Westfälische Friede geschlossen, der den Dreißigjährigen Krieg beendete?", optionen: ["1618", "1555", "1648", "1713"], richtig: 2 },
  { id: "l9-2", level: 9, frage: "In welcher Schlacht wurde Napoleon 1815 endgültig besiegt?", optionen: ["Leipzig", "Waterloo", "Austerlitz", "Trafalgar"], richtig: 1 },
  { id: "l9-3", level: 9, frage: "Wie heißt die Hauptstadt von Myanmar?", optionen: ["Rangun", "Mandalay", "Bagan", "Naypyidaw"], richtig: 3 },
  { id: "l9-4", level: 9, frage: "Wer entdeckte 1928 das Penicillin?", optionen: ["Alexander Fleming", "Louis Pasteur", "Robert Koch", "Marie Curie"], richtig: 0 },
  { id: "l9-5", level: 9, frage: "Wer schrieb den Roman „Der Zauberberg“?", optionen: ["Hermann Hesse", "Thomas Mann", "Robert Musil", "Franz Kafka"], richtig: 1 },
  { id: "l10-1", level: 10, frage: "Wer bewies 1994 den Großen Satz von Fermat?", optionen: ["Andrew Wiles", "Grigori Perelman", "Carl Friedrich Gauß", "Leonhard Euler"], richtig: 0 },
  { id: "l10-2", level: 10, frage: "Wie heißt die tiefste bekannte Stelle der Weltmeere?", optionen: ["Philippinengraben", "Challengertief im Marianengraben", "Tongagraben", "Sundagraben"], richtig: 1 },
  { id: "l10-3", level: 10, frage: "Welches Metall hat den höchsten Schmelzpunkt?", optionen: ["Platin", "Wolfram", "Titan", "Eisen"], richtig: 1 },
  { id: "l10-4", level: 10, frage: "Wie heißt der längste Fluss Asiens?", optionen: ["Gelber Fluss", "Mekong", "Ob", "Jangtsekiang"], richtig: 3 },
  { id: "l10-5", level: 10, frage: "Welches Werk von Johann Sebastian Bach blieb unvollendet?", optionen: ["Die Kunst der Fuge", "Das Wohltemperierte Klavier", "Die Brandenburgischen Konzerte", "Die Goldberg-Variationen"], richtig: 0 },
];
