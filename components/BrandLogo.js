import Image from "next/image";

export default function BrandLogo(props) {
  const {
    theme = "dark",
    size = 24,
    alt = "SharePass logo",
    className = "",
  } = props;
  const src = theme === "light" ? "/light-theme-logo.png" : "/dark-theme-logo.png";

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
