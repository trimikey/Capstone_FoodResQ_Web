const fs = require('fs');
const path = require('path');
const { withDangerousMod, withProjectBuildGradle } = require('@expo/config-plugins');

const GRADLE_VERSION = '8.14.3';
const MARKER_START = '// FOODRESQ_WINDOWS_NATIVE_BUILD_FIX_START';
const MARKER_END = '// FOODRESQ_WINDOWS_NATIVE_BUILD_FIX_END';

const buildGradlePatch = `
${MARKER_START}
def foodresqShortRoot = { envName, dirName ->
  def configuredRoot = System.getenv(envName)
  if (configuredRoot) {
    return configuredRoot
  }

  return System.getProperty('os.name').toLowerCase().contains('windows')
    ? new File(rootProject.projectDir.absolutePath.substring(0, 3), dirName).absolutePath
    : new File(rootProject.buildDir, dirName).absolutePath
}

def foodresqShortBuildProjects = [
  'react-native-async-storage_async-storage',
  'react-native-community_datetimepicker',
  'react-native-community_netinfo',
  'react-native-google-signin_google-signin',
  'react-native-gesture-handler',
  'react-native-masked-view_masked-view',
]

def foodresqCodegenAutolinkReplacements = [
  '@react-native-async-storage/async-storage': 'react-native-async-storage_async-storage',
  '@react-native-community/datetimepicker': 'react-native-community_datetimepicker',
  '@react-native-community/netinfo': 'react-native-community_netinfo',
  '@react-native-google-signin/google-signin': 'react-native-google-signin_google-signin',
  'react-native-gesture-handler': 'react-native-gesture-handler',
]

subprojects { subproject ->
  if (subproject.name in foodresqShortBuildProjects) {
    subproject.buildDir = new File(foodresqShortRoot('FOODRESQ_BUILD_ROOT', 'frq-build'), subproject.name)
  }

  subproject.afterEvaluate {
    if (subproject.name == 'app') {
      subproject.tasks.configureEach { task ->
        if (task.name.startsWith('configureCMake')) {
          task.doFirst {
            def cmakeFile = new File(subproject.buildDir, 'generated/autolinking/src/main/jni/Android-autolinking.cmake')
            if (!cmakeFile.exists()) {
              return
            }

            def shortBuildRoot = foodresqShortRoot('FOODRESQ_BUILD_ROOT', 'frq-build')
            def rewrittenLines = cmakeFile.readLines('UTF-8').collect { line ->
              def replacement = foodresqCodegenAutolinkReplacements.find { packagePath, projectName ->
                line.contains(packagePath) && line.contains('/android/build/generated/source/codegen/jni/')
              }

              if (!replacement) {
                return line
              }

              def startToken = 'add_subdirectory("'
              def pathStart = line.indexOf(startToken)
              if (pathStart < 0) {
                return line
              }

              pathStart += startToken.length()
              def pathEnd = line.indexOf('"', pathStart)
              if (pathEnd < 0) {
                return line
              }

              def shortCodegenDir = new File(shortBuildRoot, "\${replacement.value}/generated/source/codegen/jni").absolutePath.replace('\\\\', '/')
              return line.substring(0, pathStart) + shortCodegenDir + '/' + line.substring(pathEnd)
            }

            cmakeFile.setText(rewrittenLines.join(System.lineSeparator()) + System.lineSeparator(), 'UTF-8')
          }
        }
      }
    }

    if (subproject.name in ['react-native-screens', 'react-native-worklets', 'react-native-reanimated', 'react-native-gesture-handler'] && subproject.hasProperty('android')) {
      subproject.android.externalNativeBuild.cmake.buildStagingDirectory(
        new File(foodresqShortRoot('FOODRESQ_CXX_ROOT', 'frq-cxx'), subproject.name)
      )
      subproject.android.defaultConfig.externalNativeBuild.cmake.arguments '-DCMAKE_SUPPRESS_REGENERATION=ON'
    }
  }
}
${MARKER_END}
`;

function applyBuildGradlePatch(contents) {
  if (contents.includes('foodresqShortRoot')) {
    return contents;
  }

  const anchor = 'apply plugin: "expo-root-project"';
  if (!contents.includes(anchor)) {
    return `${contents.trimEnd()}\n${buildGradlePatch}\n`;
  }

  return contents.replace(anchor, `${buildGradlePatch}\n${anchor}`);
}

function pinGradleWrapper(androidProjectRoot) {
  const wrapperPath = path.join(androidProjectRoot, 'gradle', 'wrapper', 'gradle-wrapper.properties');
  if (!fs.existsSync(wrapperPath)) {
    return;
  }

  const contents = fs.readFileSync(wrapperPath, 'utf8');
  const nextContents = contents.replace(
    /^distributionUrl=.*$/m,
    `distributionUrl=https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`,
  );

  if (nextContents !== contents) {
    fs.writeFileSync(wrapperPath, nextContents);
  }
}

module.exports = function withAndroidWindowsNativeBuildFix(config) {
  config = withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      config.modResults.contents = applyBuildGradlePatch(config.modResults.contents);
    }

    return config;
  });

  return withDangerousMod(config, [
    'android',
    (config) => {
      pinGradleWrapper(config.modRequest.platformProjectRoot);
      return config;
    },
  ]);
};
