import Image from "next/image";

export default function BrandLogo({
  theme = "dark",
  size = 24,
  alt = "SharePass logo",
  className = "",
}) {
  const src = theme === "light" ? "/dark-theme-logo.png" : "/light-theme-logo.png";

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        display: "block",
        objectFit: "contain",
      }}
    />
  );
}
