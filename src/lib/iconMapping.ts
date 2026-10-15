import {
  LegIcon,
  ArrowPathIcon,
  ArrowUpRightIcon,
  ArrowDownLeftIcon,
  CogIcon,
  CheckCircleIcon,
} from "@heroicons/react/20/solid";

export function getIconForMovement(pattern: string): React.ReactNode {
  const iconMap: Record<string, React.ReactNode> = {
    squat: <LegIcon className="w-5 h-5" />,
    hinge: <ArrowPathIcon className="w-5 h-5" />,
    press: <ArrowUpRightIcon className="w-5 h-5" />,
    pull: <ArrowDownLeftIcon className="w-5 h-5" />,
    carry: <CheckCircleIcon className="w-5 h-5" />,
    rotate: <ArrowPathIcon className="w-5 h-5" />,
    machine: <CogIcon className="w-5 h-5" />,
  };
  return iconMap[pattern?.toLowerCase()] || <CheckCircleIcon className="w-5 h-5" />;
}
