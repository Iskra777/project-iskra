import { cn } from "@/lib/utils";

export interface AvatarProps {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
}

export function Avatar({ src, alt, size = 80, className }: AvatarProps) {
  const style = { width: size, height: size };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- вже оптимізований Cloudinary webp, next/image тут зайвий
      <img
        src={src}
        alt={alt}
        style={style}
        className={cn("rounded-full object-cover", className)}
      />
    );
  }

  return (
    <div
      style={style}
      className={cn(
        "flex items-center justify-center rounded-full bg-primary/20 font-medium text-primary",
        className,
      )}
    >
      {alt.charAt(0).toUpperCase()}
    </div>
  );
}
