import { HugeiconsIcon } from "@hugeicons/react";
import type { KubaiIconProps } from "kubai-icons-react";
import type { CatalogIcon } from "@/lib/iconCatalog";
import { CushnIcon } from "./icons";

type Props = {
  icon: CatalogIcon | undefined;
  className?: string;
  trigger?: KubaiIconProps["trigger"];
  /** Only the logo has strokes; the pictures are filled. */
  logoStrokeWidth?: number;
};

export const CatalogIconPicture = ({
  icon,
  className,
  trigger = "none",
  logoStrokeWidth = 2,
}: Props) => {
  const Picture = icon?.picture;
  return Picture ? (
    <Picture trigger={trigger} className={className} />
  ) : (
    <HugeiconsIcon
      icon={CushnIcon}
      strokeWidth={logoStrokeWidth}
      aria-hidden
      className={className}
    />
  );
};
