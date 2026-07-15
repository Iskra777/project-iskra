import { Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="flex items-center gap-2 text-foreground">
        Iskra
        <Zap className="h-8 w-8 fill-accent text-accent" />
      </h1>
      <p className="max-w-md text-foreground/70 md:max-w-lg md:text-lg">
        One Spark Can Change Everything.
      </p>
    </div>
  );
}
