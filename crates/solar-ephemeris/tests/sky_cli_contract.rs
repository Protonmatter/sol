use std::process::{Command, Output};

fn sky(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_sky"))
        .args(args)
        .output()
        .expect("run the Cargo-built sky CLI")
}

#[test]
fn malformed_numbers_fail_with_usage_exit_instead_of_panicking() {
    for position in 0..4 {
        let mut args = ["1783512000", "0", "0", "0"];
        args[position] = "invalid-number";
        let output = sky(&args);
        assert_eq!(output.status.code(), Some(2), "argument {position}");
        assert!(output.stdout.is_empty());
        let error = String::from_utf8(output.stderr).expect("UTF-8 error");
        assert!(error.contains("usage: sky"));
        assert!(!error.contains("panicked"));
        assert!(!error.contains("invalid-number"), "do not echo raw input");
    }
}

#[test]
fn the_cli_requires_exactly_four_arguments_and_preserves_valid_json_output() {
    for args in [
        vec![],
        vec!["1783512000", "0", "0"],
        vec!["1783512000", "0", "0", "0", "unexpected"],
    ] {
        let output = sky(&args);
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        assert!(String::from_utf8(output.stderr)
            .expect("UTF-8 usage")
            .contains("usage: sky"));
    }

    let output = sky(&["1783512000", "0", "0", "0"]);
    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    let json = String::from_utf8(output.stdout).expect("UTF-8 snapshot");
    assert!(json.trim_start().starts_with('{'));
    let compact: String = json.chars().filter(|c| !c.is_whitespace()).collect();
    assert!(compact.contains("\"schema_version\":\"ephemeris-snapshot.v4\""));
    assert!(json.contains("\"bodies\""));
}

#[test]
fn nonfinite_numbers_retain_the_engine_error_exit() {
    for value in ["NaN", "inf", "-inf", "1e999"] {
        let output = sky(&[value, "0", "0", "0"]);
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        let error = String::from_utf8(output.stderr).expect("UTF-8 engine error");
        assert!(error.contains("\"error\""));
        assert!(!error.contains("panicked"));
    }
}

#[cfg(any(unix, windows))]
#[test]
fn invalid_unicode_argument_uses_the_same_predictable_error_path() {
    #[cfg(unix)]
    let argument = {
        use std::os::unix::ffi::OsStringExt;
        std::ffi::OsString::from_vec(vec![0xff])
    };
    #[cfg(windows)]
    let argument = {
        use std::os::windows::ffi::OsStringExt;
        std::ffi::OsString::from_wide(&[0xd800])
    };
    let output = Command::new(env!("CARGO_BIN_EXE_sky"))
        .arg(argument)
        .args(["0", "0", "0"])
        .output()
        .expect("run sky with a non-Unicode argument");
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    let error = String::from_utf8(output.stderr).expect("ASCII diagnostic");
    assert!(error.contains("usage: sky"));
    assert!(!error.contains("panicked"));
}
