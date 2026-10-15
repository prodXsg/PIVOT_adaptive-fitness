import {
  CheckCircleIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  Cog6ToothIcon,
  FireIcon,
} from "@heroicons/react/20/solid";

export function getIconForMovement(pattern: string): React.ReactNode {
  const iconMap: Record<string, React.ReactNode> = {
    squat: <ArrowDownIcon className="w-5 h-5" />,
    hinge: <ArrowPathIcon className="w-5 h-5" />,
    press: <ArrowUpIcon className="w-5 h-5" />,
    pull: <ArrowDownIcon className="w-5 h-5" />,
    carry: <FireIcon className="w-5 h-5" />,
    rotate: <ArrowPathIcon className="w-5 h-5" />,
    machine: <Cog6ToothIcon className="w-5 h-5" />,
  };
  return iconMap[pattern?.toLowerCase()] || <CheckCircleIcon className="w-5 h-5" />;
}
