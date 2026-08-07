// DESIGN_SYSTEM.md → Typography: та сама шкала, що на вебі (h1-h3/body/small).

interface TextStyle {
  fontSize: number;
  fontWeight: "400" | "600" | "700";
}

const Typography: Record<"h1" | "h2" | "h3" | "body" | "small", TextStyle> = {
  h1: { fontSize: 40, fontWeight: "700" },
  h2: { fontSize: 32, fontWeight: "600" },
  h3: { fontSize: 24, fontWeight: "600" },
  body: { fontSize: 16, fontWeight: "400" },
  small: { fontSize: 14, fontWeight: "400" },
};

export default Typography;
