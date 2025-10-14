import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const targetVersion = process.env.npm_package_version;

// read minAppVersion from manifest.json and bump version to target version
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// update versions.json with target version and minAppVersion from manifest.json
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));

// automatically commit and tag the release
execSync(`git commit -am "release ${targetVersion}"`);
try {
	execSync(`git tag -d ${targetVersion}`, { stdio: "ignore" });
} catch (error) {
	// tag doesn't exist, which is fine
}
execSync(`git tag -a ${targetVersion} -m "${targetVersion}"`);
