import { execSync } from "child_process";

export default function globalSetup() {
  console.log("Building extension...");
  execSync("npm run build", { stdio: "inherit" });
}
