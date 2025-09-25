export {
  FRAMEWORKS,
  FrameworkRegistry,
  createFrameworkRegistry,
  isFrameworkAllowed,
  listFrameworks,
  type FrameworkId,
  type FrameworkMeta,
  type Availability as FrameworkAvailability,
} from "@speckit/framework-registry";

export type FrameworkStatus = "experimental" | "ga";
