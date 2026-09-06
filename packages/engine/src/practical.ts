import type { Progress, Skill } from "./types.ts";

export interface Phrase {
  id: string;
  de: string;
  en: string;
  note: string;
  alternatives: string[];
}
export interface Unit {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  tip: string;
  phrases: Phrase[];
}
const unit = (
  id: string,
  title: string,
  subtitle: string,
  icon: string,
  tip: string,
  rows: string[][],
): Unit => ({
  id,
  title,
  subtitle,
  icon,
  tip,
  phrases: rows.map(([slug, de, en, note = "", ...alternatives]) => ({
    id: `daily-${id}-${slug}`,
    de,
    en,
    note,
    alternatives,
  })),
});
export const units: Unit[] = [
  unit(
    "hello",
    "Small words, real connections",
    "Greet, thank and say you’re welcome.",
    "↗",
    "Bitte means “please” and also “you’re welcome”. Use Sie with adults you do not know; du with friends.",
    [
      ["hello", "Hallo!", "Hello!"],
      ["morning", "Guten Morgen!", "Good morning!"],
      ["day", "Guten Tag!", "Good day!"],
      ["evening", "Guten Abend!", "Good evening!"],
      ["thanks", "Danke!", "Thank you!", "", "Vielen Dank!"],
      [
        "welcome",
        "Bitte!",
        "You’re welcome!",
        "A reply to Danke. Gern geschehen is another natural reply.",
        "Gern geschehen!",
        "Bitte schön!",
      ],
      ["sorry", "Entschuldigung!", "Excuse me!"],
      [
        "bye",
        "Auf Wiedersehen!",
        "Goodbye!",
        "Use Tschüss in informal situations.",
        "Tschüss!",
      ],
    ],
  ),
  unit(
    "introductions",
    "A little about you",
    "Introduce yourself and keep a conversation going.",
    "↔",
    "The verb usually comes second in a statement: Ich heiße Anna. In a question: Wie heißen Sie? Replace Anna and Berlin with your own details when practising aloud.",
    [
      [
        "name",
        "Ich heiße Anna.",
        "My name is Anna.",
        "heißen: ich heiße, du heißt, Sie heißen.",
        "Mein Name ist Anna.",
      ],
      ["ask", "Wie heißen Sie?", "What is your name? (formal)"],
      ["from", "Ich komme aus Spanien.", "I come from Spain."],
      ["live", "Ich wohne in Berlin.", "I live in Berlin."],
      ["meet", "Freut mich!", "Nice to meet you!"],
      ["you", "Und Sie?", "And you? (formal)"],
      ["german", "Ich lerne Deutsch.", "I am learning German."],
      [
        "little",
        "Ich spreche ein bisschen Deutsch.",
        "I speak a little German.",
      ],
    ],
  ),
  unit(
    "repair",
    "Keep the conversation going",
    "Ask for repetition, clarity and help.",
    "↻",
    "You do not need every word to have a conversation. Learn how to ask the other person to slow down, repeat or explain.",
    [
      ["understand", "Ich verstehe nicht.", "I don’t understand."],
      [
        "repeat",
        "Können Sie das bitte wiederholen?",
        "Can you repeat that, please?",
      ],
      ["slow", "Bitte sprechen Sie langsamer.", "Please speak more slowly."],
      ["means", "Was bedeutet das?", "What does that mean?"],
      ["english", "Sprechen Sie Englisch?", "Do you speak English?"],
      ["help", "Können Sie mir helfen?", "Can you help me?"],
      [
        "write",
        "Können Sie das bitte aufschreiben?",
        "Can you write that down, please?",
      ],
    ],
  ),
  unit(
    "numbers",
    "Numbers you actually need",
    "Count, understand prices and give quantities.",
    "#",
    "From 21, say the units before the tens: ein-und-zwanzig. Sixteen is sechzehn; seventeen is siebzehn. Learn the sounds as well as the spelling.",
    [
      ...[
        ["zero", "null", "Zero"],
        ["one", "eins", "One"],
        ["two", "zwei", "Two"],
        ["three", "drei", "Three"],
        ["four", "vier", "Four"],
        ["five", "fünf", "Five"],
        ["six", "sechs", "Six"],
        ["seven", "sieben", "Seven"],
        ["eight", "acht", "Eight"],
        ["nine", "neun", "Nine"],
        ["ten", "zehn", "Ten"],
        ["eleven", "elf", "Eleven"],
        ["twelve", "zwölf", "Twelve"],
        ["thirteen", "dreizehn", "Thirteen"],
        ["fourteen", "vierzehn", "Fourteen"],
        ["fifteen", "fünfzehn", "Fifteen"],
        ["sixteen", "sechzehn", "Sixteen"],
        ["seventeen", "siebzehn", "Seventeen"],
        ["eighteen", "achtzehn", "Eighteen"],
        ["nineteen", "neunzehn", "Nineteen"],
        ["twenty", "zwanzig", "Twenty"],
        ["twentyone", "einundzwanzig", "Twenty-one"],
        ["thirty", "dreißig", "Thirty"],
        ["hundred", "hundert", "One hundred"],
      ],
    ],
  ),
  unit(
    "days",
    "Make a plan",
    "Days of the week and simple arrangements.",
    "◷",
    "Use am with a day: am Montag. German halb drei means 2:30, halfway to three. Nouns, including days, start with a capital.",
    [
      ["mon", "Montag", "Monday"],
      ["tue", "Dienstag", "Tuesday"],
      ["wed", "Mittwoch", "Wednesday"],
      ["thu", "Donnerstag", "Thursday"],
      ["fri", "Freitag", "Friday"],
      [
        "sat",
        "Samstag",
        "Saturday",
        "Sonnabend is also used in some regions.",
        "Sonnabend",
      ],
      ["sun", "Sonntag", "Sunday"],
      ["today", "heute", "Today"],
      [
        "tomorrow",
        "morgen",
        "Tomorrow",
        "Lowercase morgen means tomorrow; der Morgen means the morning.",
      ],
      ["when", "Wann haben Sie Zeit?", "When do you have time?"],
      ["monday", "Am Montag um drei Uhr.", "On Monday at three o’clock."],
      ["half", "Es ist halb drei.", "It is half past two."],
    ],
  ),
  unit(
    "colors",
    "Find the right one",
    "Colours and everyday descriptions.",
    "◒",
    "After ist, a colour stays unchanged: Die Tasche ist rot. Before a noun it gets an ending: eine rote Tasche. Start by describing what you see.",
    [
      ["red", "rot", "Red"],
      ["blue", "blau", "Blue"],
      ["green", "grün", "Green"],
      ["yellow", "gelb", "Yellow"],
      ["black", "schwarz", "Black"],
      ["white", "weiß", "White"],
      ["grey", "grau", "Grey"],
      ["brown", "braun", "Brown"],
      ["pink", "rosa", "Pink"],
      ["orange", "orange", "Orange (colour)"],
      ["bag", "Die Tasche ist rot.", "The bag is red."],
      ["which", "Welche Farbe?", "Which colour?"],
    ],
  ),
  unit(
    "cafe",
    "Your first café order",
    "Order politely, ask for water and pay.",
    "☕",
    "Ich möchte … is a polite way to order. A masculine object changes ein to einen: einen Kaffee. Learn nouns with their article: der Kaffee, das Wasser, die Rechnung.",
    [
      [
        "coffee",
        "Ich möchte einen Kaffee, bitte.",
        "I would like a coffee, please.",
      ],
      ["water", "Ein Wasser, bitte.", "A water, please."],
      [
        "still",
        "Ohne Kohlensäure, bitte.",
        "Still water, please.",
        "Literally: without carbonation, please.",
      ],
      ["milk", "Mit Milch, bitte.", "With milk, please."],
      ["no", "Ohne Zucker, bitte.", "Without sugar, please."],
      ["bill", "Die Rechnung, bitte.", "The bill, please."],
      ["card", "Kann ich mit Karte bezahlen?", "Can I pay by card?"],
      ["takeaway", "Zum Mitnehmen, bitte.", "To take away, please."],
    ],
  ),
  unit(
    "shops",
    "At the shops",
    "Ask the price and find what you need.",
    "▧",
    "Use Ich suche … to ask for something. Keep noun plurals together with the singular: das Brot → die Brote; der Apfel → die Äpfel.",
    [
      ["price", "Wie viel kostet das?", "How much does that cost?"],
      ["bread", "Ich hätte gern ein Brot.", "I would like a loaf of bread."],
      [
        "apples",
        "Zwei Äpfel, bitte.",
        "Two apples, please.",
        "der Apfel → die Äpfel.",
      ],
      ["look", "Ich suche eine Apotheke.", "I am looking for a pharmacy."],
      [
        "size",
        "Haben Sie das eine Nummer größer?",
        "Do you have that one size larger?",
      ],
      ["only", "Ich schaue nur, danke.", "I am just looking, thank you."],
      ["bag", "Ich brauche eine Tasche.", "I need a bag."],
    ],
  ),
  unit(
    "travel",
    "Find your way",
    "Get around town and catch your train.",
    "→",
    "Wo asks where something is. Wohin asks where someone is going. Learn directions as useful chunks before worrying about every ending.",
    [
      ["station", "Wo ist der Bahnhof?", "Where is the train station?"],
      ["toilet", "Wo ist die Toilette?", "Where is the toilet?"],
      ["left", "links", "Left"],
      ["right", "rechts", "Right"],
      ["straight", "geradeaus", "Straight ahead"],
      [
        "ticket",
        "Eine Fahrkarte nach Berlin, bitte.",
        "A ticket to Berlin, please.",
      ],
      [
        "platform",
        "Von welchem Gleis fährt der Zug ab?",
        "Which platform does the train leave from?",
      ],
      ["late", "Der Zug hat Verspätung.", "The train is delayed."],
    ],
  ),
  unit(
    "help",
    "When you need help",
    "Say what is wrong and ask for assistance.",
    "+",
    "Ich brauche … means I need … . For a masculine object use einen: Ich brauche einen Arzt. Practise these phrases before you need them.",
    [
      ["help", "Hilfe!", "Help!"],
      ["doctor", "Ich brauche einen Arzt.", "I need a doctor."],
      ["ill", "Mir ist schlecht.", "I feel sick."],
      ["pain", "Ich habe Schmerzen.", "I am in pain."],
      ["allergy", "Ich bin gegen Nüsse allergisch.", "I am allergic to nuts."],
      ["lost", "Ich habe mein Handy verloren.", "I have lost my phone."],
      [
        "emergency",
        "Bitte rufen Sie einen Krankenwagen!",
        "Please call an ambulance!",
      ],
    ],
  ),
];
export const phrases = units.flatMap((u) => u.phrases);
export interface DailyExercise {
  phrase: Phrase;
  skill: Skill;
  key: string;
  fresh: boolean;
}
export function dailySession(
  progress: Progress,
  unitId?: string,
  now = new Date(),
): DailyExercise[] {
  const selected = units.find((u) => u.id === unitId);
  const pool = selected?.phrases ?? phrases;
  const result: DailyExercise[] = [];
  // Global due reviews are never hidden by the currently selected topic.
  for (const phrase of phrases)
    for (const skill of ["recognise", "produce", "listen"] as const) {
      const key = `${phrase.id}#${skill}`;
      const card = progress.cards[key];
      if (card && new Date(card.due) <= now)
        result.push({ phrase, skill, key, fresh: false });
    }
  result.sort(
    (a, b) =>
      Date.parse(progress.cards[a.key].due) -
      Date.parse(progress.cards[b.key].due),
  );
  const reviews = result.slice(0, 8);
  for (const phrase of pool) {
    if (reviews.length >= 12) break;
    const skill = (["recognise", "produce", "listen"] as const).find(
      (s) => !progress.cards[`${phrase.id}#${s}`],
    );
    if (!skill || reviews.some((e) => e.phrase.id === phrase.id)) continue;
    reviews.push({
      phrase,
      skill,
      key: `${phrase.id}#${skill}`,
      fresh: !progress.cards[`${phrase.id}#recognise`],
    });
    if (reviews.filter((e) => e.fresh).length >= 4) break;
  }
  return reviews;
}
export function phraseMatches(phrase: Phrase, input: string): boolean {
  const normalize = (s: string) =>
    s
      .normalize("NFC")
      .toLowerCase()
      .replace(/ß/g, "ss")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/[.,!?;:“”"']/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return [phrase.de, ...phrase.alternatives].some(
    (s) => normalize(s) === normalize(input),
  );
}
