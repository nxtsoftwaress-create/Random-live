export const INTERESTS = [
  "Technology",
  "Gaming",
  "Music",
  "Travel",
  "Movies",
  "Business",
  "Art",
  "Fitness",
  "Food",
  "Science",
  "Books",
  "Random",
] as const;

export const LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "any", label: "Any language" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "hi", label: "Hindi" },
  { value: "ar", label: "Arabic" },
  { value: "ja", label: "Japanese" },
];

export const MAX_INTERESTS = 10;
