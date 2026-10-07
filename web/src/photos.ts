// Photos from Unsplash (free licence), served from /images. Credited in the footer.
export type Photo = { src: string; alt: string; by: string; url: string };

const u = (path: string) => `https://unsplash.com/photos/${path}`;

export const PHOTOS = {
  hero: { src: "/images/hero.webp", alt: "A woman with a cup of tea waving at a colleague on her laptop", by: "Helena Lopes", url: u("woman-in-black-long-sleeve-shirt-holding-white-ceramic-mug-_SzvRwdFo6o") },
  write: { src: "/images/write.webp", alt: "Hands typing code on a laptop next to a potted plant", by: "Nubelson Fernandes", url: u("person-coding-on-laptop-workspace-UcYBL5V0xWQ") },
  speak: { src: "/images/speak.webp", alt: "A laptop showing a video call grid beside a teal mug", by: "Chris Montgomery", url: u("macbook-pro-displaying-group-of-people-smgTvepind4") },
  facts: { src: "/images/facts.webp", alt: "A team holding a standup around a wooden table with sticky notes", by: "Parabol", url: u("a-group-of-people-sitting-around-a-wooden-table-e5ob6fBTi64") },
  engineers: { src: "/images/engineers.webp", alt: "A laptop showing code", by: "Arnold Francisca", url: u("turned-on-macbook-pro-wit-programming-codes-display-f77Bh3inUpE") },
  managers: { src: "/images/managers.webp", alt: "Three colleagues talking at a table in a bright office", by: "airfocus", url: u("woman-in-white-shirt-sitting-beside-man-in-red-crew-neck-t-shirt-DvQIwyafV7A") },
  founders: { src: "/images/founders.webp", alt: "A woman in a yellow jacket and hat working at her desk", by: "Brandy Kennedy", url: u("a-woman-sitting-at-a-desk-working-on-a-laptop-BkwzVF6mHdc") },
  remote: { src: "/images/remote.webp", alt: "A man on a video call from home", by: "Bluestonex", url: u("man-on-laptop-participating-in-a-video-conference-call-9Pqp6CUaIu4") },
  privacy: { src: "/images/privacy.webp", alt: "A mug and a small plant on a sunny table", by: "Spencer Imbrock", url: u("shallow-focus-photography-of-white-ceramic-mug-beside-green-leafed-plant-7R8vJXlnLzo") },
  final: { src: "/images/final.webp", alt: "A woman smiling at her laptop surrounded by plants", by: "Shane Ryan Herilalaina", url: u("young-woman-working-on-a-laptop-surrounded-by-plants-N9zoS5-DzkY") },
} satisfies Record<string, Photo>;
