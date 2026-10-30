export const f = () => Bun.file("x").text();
export const g = () => Bun.spawn(["ls"]);
