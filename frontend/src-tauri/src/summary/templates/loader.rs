use super::defaults;
use super::types::Template;
use std::path::{Path, PathBuf};
use std::io::Write;
use tracing::{debug, info, warn};
use once_cell::sync::Lazy;
use std::sync::RwLock;

// Global storage for the bundled templates directory path
static BUNDLED_TEMPLATES_DIR: Lazy<RwLock<Option<PathBuf>>> = Lazy::new(|| RwLock::new(None));

const MAX_TEMPLATE_BYTES: usize = 64 * 1024;

/// IDs are filenames, never paths. Keep legacy manually supplied templates readable.
fn is_safe_template_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128
        && id.as_bytes()[0].is_ascii_alphanumeric()
        && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}

fn is_preset(id: &str) -> bool {
    defaults::get_builtin_template(id).is_some()
        || BUNDLED_TEMPLATES_DIR.read().ok()
            .and_then(|dir| dir.as_ref().map(|path| path.join(format!("{}.json", id)).exists()))
            .unwrap_or(false)
}

pub fn is_custom_template(id: &str) -> bool {
    is_safe_template_id(id) && id.starts_with("custom_") && id.len() > 7 && !is_preset(id)
}

fn require_custom_id(id: &str) -> Result<(), String> {
    if !is_custom_template(id) {
        return Err("Only custom templates with a safe custom_ identifier can be changed. Duplicate a preset instead.".into());
    }
    Ok(())
}

fn require_regular_file(path: &Path) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|e| format!("Cannot access custom template: {}. Refresh templates and try again.", e))?;
    if !metadata.file_type().is_file() {
        return Err("Custom template must be a regular file, not a directory or symbolic link.".into());
    }
    Ok(())
}

fn save_custom_template_in(dir: &Path, id: Option<&str>, json: &str) -> Result<(String, Template), String> {
    // Validate everything before creating a directory or touching the previous file.
    if json.len() > MAX_TEMPLATE_BYTES {
        return Err("Template exceeds 64 KiB. Shorten the text before saving.".into());
    }
    let template = validate_and_parse_template(json)?;
    if let Some(id) = id { require_custom_id(id)?; }
    let serialized = serde_json::to_vec(&template).map_err(|e| e.to_string())?;
    let template_id = id.map(str::to_owned).unwrap_or_else(|| format!("custom_{}", uuid::Uuid::new_v4()));
    let target = dir.join(format!("{}.json", template_id));
    if id.is_some() { require_regular_file(&target)?; }
    std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create the templates directory: {}. Check folder permissions.", e))?;
    let mut file = tempfile::NamedTempFile::new_in(dir)
        .map_err(|e| format!("Cannot create a temporary template file: {}. Check folder permissions and free space.", e))?;
    file.write_all(&serialized).and_then(|_| file.as_file().sync_all())
        .map_err(|e| format!("Cannot write the template: {}. Check free space and folder permissions.", e))?;
    if id.is_some() {
        file.persist(&target).map_err(|e| format!("Cannot replace the template: {}. Close programs using the file and retry.", e))?;
    } else {
        file.persist_noclobber(&target).map_err(|e| format!("Cannot save the template: {}. Retry saving.", e))?;
    }
    Ok((template_id, template))
}

pub fn save_custom_template(id: Option<&str>, json: &str) -> Result<(String, Template), String> {
    let dir = get_custom_templates_dir().ok_or("Cannot locate the application data directory.")?;
    save_custom_template_in(&dir, id, json)
}

fn delete_custom_template_in(dir: &Path, id: &str) -> Result<(), String> {
    require_custom_id(id)?;
    let path = dir.join(format!("{}.json", id));
    require_regular_file(&path)?;
    std::fs::remove_file(path).map_err(|e| format!("Cannot delete the template: {}. Check folder permissions and retry.", e))
}

pub fn delete_custom_template(id: &str) -> Result<(), String> {
    let dir = get_custom_templates_dir().ok_or("Cannot locate the application data directory.")?;
    delete_custom_template_in(&dir, id)
}

/// Set the bundled templates directory path (called once at app startup)
pub fn set_bundled_templates_dir(path: PathBuf) {
    info!("Bundled templates directory set to: {:?}", path);
    if let Ok(mut dir) = BUNDLED_TEMPLATES_DIR.write() {
        *dir = Some(path);
    }
}

/// Get the user's custom templates directory path
///
/// Returns the platform-specific application data directory for custom templates:
/// - macOS: ~/Library/Application Support/Meetily/templates/
/// - Windows: %APPDATA%\Meetily\templates\
/// - Linux: ~/.config/Meetily/templates/
fn get_custom_templates_dir() -> Option<PathBuf> {
    let mut path = dirs::data_dir()?;
    path.push("Meetily");
    path.push("templates");
    Some(path)
}

/// Load a template from the bundled resources directory
///
/// # Arguments
/// * `template_id` - Template identifier (without .json extension)
///
/// # Returns
/// The template JSON content if found, None otherwise
fn load_bundled_template(template_id: &str) -> Option<String> {
    let bundled_dir = BUNDLED_TEMPLATES_DIR.read().ok()?.clone()?;
    let template_path = bundled_dir.join(format!("{}.json", template_id));

    debug!("Checking for bundled template at: {:?}", template_path);

    match std::fs::read_to_string(&template_path) {
        Ok(content) => {
            info!("Loaded bundled template '{}' from {:?}", template_id, template_path);
            Some(content)
        }
        Err(e) => {
            debug!("No bundled template '{}' found: {}", template_id, e);
            None
        }
    }
}

/// Load a template from the user's custom templates directory
///
/// # Arguments
/// * `template_id` - Template identifier (without .json extension)
///
/// # Returns
/// The template JSON content if found, None otherwise
fn load_custom_template(template_id: &str) -> Option<String> {
    let custom_dir = get_custom_templates_dir()?;
    load_custom_template_from(&custom_dir, template_id)
}

fn load_custom_template_from(custom_dir: &Path, template_id: &str) -> Option<String> {
    let template_path = custom_dir.join(format!("{}.json", template_id));

    debug!("Checking for custom template at: {:?}", template_path);

    match std::fs::read_to_string(&template_path) {
        Ok(content) => {
            info!("Loaded custom template '{}' from {:?}", template_id, template_path);
            Some(content)
        }
        Err(e) => {
            debug!("No custom template '{}' found: {}", template_id, e);
            None
        }
    }
}

/// Load and parse a template by identifier
///
/// This function implements a fallback strategy:
/// 1. Check bundled resources directory (app presets)
/// 2. Fall back to built-in embedded templates
/// 3. Check user's custom templates directory for non-preset IDs
/// 4. Return error if not found in any location
///
/// # Arguments
/// * `template_id` - Template identifier (e.g., "daily_standup", "standard_meeting")
///
/// # Returns
/// Parsed and validated Template struct
pub fn get_template(template_id: &str) -> Result<Template, String> {
    if !is_safe_template_id(template_id) {
        return Err("Invalid template identifier.".into());
    }
    info!("Loading template: {}", template_id);

    // User files cannot shadow embedded or bundled presets.
    let json_content = if let Some(bundled_content) = load_bundled_template(template_id) {
        bundled_content
    } else if let Some(builtin_content) = defaults::get_builtin_template(template_id) {
        builtin_content.to_string()
    } else if let Some(custom_content) = load_custom_template(template_id) {
        debug!("Using custom template for '{}'", template_id);
        custom_content
    } else {
        return Err(format!(
            "Template '{}' not found. Available templates: {}",
            template_id,
            list_template_ids().join(", ")
        ));
    };

    // Parse and validate
    validate_and_parse_template(&json_content)
}

/// Validate and parse template JSON
///
/// # Arguments
/// * `json_content` - Raw JSON string
///
/// # Returns
/// Parsed and validated Template struct
pub fn validate_and_parse_template(json_content: &str) -> Result<Template, String> {
    let mut template: Template = serde_json::from_str(json_content)
        .map_err(|e| format!("Failed to parse template JSON: {}", e))?;

    template.validate()?;

    template.name = template.name.trim().to_string();
    template.description = template.description.trim().to_string();
    for section in &mut template.sections {
        section.title = section.title.trim().to_string();
        section.instruction = section.instruction.trim().to_string();
        section.format = section.format.trim().to_string();
    }

    Ok(template)
}

/// List all available template identifiers
///
/// Returns a combined list of:
/// - Built-in template IDs
/// - Bundled template IDs (from app resources)
/// - Custom template IDs (from user's data directory)
pub fn list_template_ids() -> Vec<String> {
    let mut ids: Vec<String> = defaults::list_builtin_template_ids()
        .into_iter()
        .map(|s| s.to_string())
        .collect();

    // Add bundled templates if directory is set
    if let Ok(bundled_dir_lock) = BUNDLED_TEMPLATES_DIR.read() {
        if let Some(bundled_dir) = bundled_dir_lock.as_ref() {
            if bundled_dir.exists() {
                match std::fs::read_dir(bundled_dir) {
                    Ok(entries) => {
                        for entry in entries.flatten() {
                            if let Some(filename) = entry.file_name().to_str() {
                                if filename.ends_with(".json") {
                                    let id = filename.trim_end_matches(".json").to_string();
                                    if is_safe_template_id(&id) && !ids.contains(&id) {
                                        ids.push(id);
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Failed to read bundled templates directory: {}", e);
                    }
                }
            }
        }
    }

    // Add custom templates if directory exists
    if let Some(custom_dir) = get_custom_templates_dir() {
        if custom_dir.exists() {
            match std::fs::read_dir(&custom_dir) {
                Ok(entries) => {
                    for entry in entries.flatten() {
                        if let Some(filename) = entry.file_name().to_str() {
                            if filename.ends_with(".json") {
                                let id = filename.trim_end_matches(".json").to_string();
                                if is_safe_template_id(&id) && !ids.contains(&id) {
                                    ids.push(id);
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to read custom templates directory: {}", e);
                }
            }
        }
    }

    ids.sort();
    ids
}

/// List all available templates with their metadata
///
/// Returns a list of (id, name, description) tuples
pub fn list_templates() -> Vec<(String, String, String)> {
    let mut templates = Vec::new();

    for id in list_template_ids() {
        match get_template(&id) {
            Ok(template) => {
                templates.push((id, template.name, template.description));
            }
            Err(e) => {
                warn!("Failed to load template '{}': {}", id, e);
            }
        }
    }

    templates
}

#[cfg(test)]
mod tests {
    use super::*;

    fn draft() -> String {
        r#"{"name":" Notes ","description":" Outcomes ","sections":[{"title":" Summary ","instruction":" Explain outcomes ","format":"paragraph"}]}"#.to_string()
    }

    #[test]
    fn rejects_blank_fields_but_reads_oversized_json() {
        for field in ["name", "description", "title", "instruction", "format"] {
            let mut value: serde_json::Value = serde_json::from_str(&draft()).unwrap();
            if field == "name" || field == "description" { value[field] = " \n ".into(); }
            else { value["sections"][0][field] = " \n ".into(); }
            assert!(validate_and_parse_template(&value.to_string()).is_err(), "{}", field);
        }
        let oversized = draft().replace("Outcomes", &"x".repeat(65_536));
        assert!(oversized.len() > MAX_TEMPLATE_BYTES);
        assert!(validate_and_parse_template(&oversized).is_ok());
    }

    #[test]
    fn oversized_save_is_rejected_before_filesystem_mutation() {
        let dir = tempfile::tempdir().unwrap();
        let oversized = draft().replace("Outcomes", &"x".repeat(65_536));
        assert!(save_custom_template_in(dir.path(), None, &oversized).is_err());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);

        let absent = dir.path().join("not-created");
        assert!(save_custom_template_in(&absent, None, &oversized).is_err());
        assert!(!absent.exists());
    }

    #[test]
    fn oversized_bundled_resource_remains_discoverable_and_loadable() {
        let dir = tempfile::tempdir().unwrap();
        let json = draft().replace("Outcomes", &"x".repeat(65_536));
        std::fs::write(dir.path().join("large_resource.json"), &json).unwrap();

        let previous = BUNDLED_TEMPLATES_DIR.read().unwrap().clone();
        set_bundled_templates_dir(dir.path().to_path_buf());
        assert!(list_template_ids().iter().any(|id| id == "large_resource"));
        assert!(get_template("large_resource").is_ok());
        if let Ok(mut bundled_dir) = BUNDLED_TEMPLATES_DIR.write() {
            *bundled_dir = previous;
        }
    }

    #[test]
    fn oversized_legacy_custom_template_remains_readable() {
        let dir = tempfile::tempdir().unwrap();
        let json = draft().replace("Outcomes", &"x".repeat(65_536));
        std::fs::write(dir.path().join("legacy_notes.json"), &json).unwrap();

        let loaded = load_custom_template_from(dir.path(), "legacy_notes").unwrap();
        assert!(validate_and_parse_template(&loaded).is_ok());
    }

    #[test]
    fn saves_updates_and_deletes_in_the_custom_directory() {
        let dir = tempfile::tempdir().unwrap();
        let (id, saved) = save_custom_template_in(dir.path(), None, &draft()).unwrap();
        assert!(id.starts_with("custom_"));
        assert_eq!(saved.name, "Notes");
        assert_eq!(saved.sections[0].title, "Summary");
        let path = dir.path().join(format!("{}.json", id));
        let updated = draft().replace("Notes", "Updated");
        save_custom_template_in(dir.path(), Some(&id), &updated).unwrap();
        assert_eq!(validate_and_parse_template(&std::fs::read_to_string(&path).unwrap()).unwrap().name, "Updated");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
        delete_custom_template_in(dir.path(), &id).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn rejects_traversal_preset_overwrites_and_missing_updates() {
        let dir = tempfile::tempdir().unwrap();
        for id in ["standard_meeting", "custom_../outside", "custom_a/b", "custom_a\\b", "custom_", "custom_a:stream", "custom_a."] {
            assert!(save_custom_template_in(dir.path(), Some(id), &draft()).is_err(), "{}", id);
            assert!(delete_custom_template_in(dir.path(), id).is_err(), "{}", id);
        }
        assert!(save_custom_template_in(dir.path(), Some("custom_missing"), &draft()).is_err());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
        assert!(get_template("../outside").is_err());
    }

    #[test]
    fn failed_save_preserves_previous_contents_and_leaves_no_temporary_file() {
        let dir = tempfile::tempdir().unwrap();
        let (id, _) = save_custom_template_in(dir.path(), None, &draft()).unwrap();
        let path = dir.path().join(format!("{}.json", id));
        let original = std::fs::read(&path).unwrap();
        assert!(save_custom_template_in(dir.path(), Some(&id), "invalid JSON").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), original);
        let blocked = dir.path().join("custom_blocked.json");
        std::fs::create_dir(&blocked).unwrap();
        assert!(save_custom_template_in(dir.path(), Some("custom_blocked"), &draft()).is_err());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 2);
        let absent = dir.path().join("not-created");
        assert!(save_custom_template_in(&absent, None, "invalid JSON").is_err());
        assert!(!absent.exists());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlink_targets() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::NamedTempFile::new().unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("custom_link.json")).unwrap();
        assert!(save_custom_template_in(dir.path(), Some("custom_link"), &draft()).is_err());
        assert!(delete_custom_template_in(dir.path(), "custom_link").is_err());
    }

    #[test]
    fn test_get_builtin_template() {
        let template = get_template("daily_standup");
        assert!(template.is_ok());

        let template = template.unwrap();
        assert_eq!(template.name, "Daily Standup");
        assert!(!template.sections.is_empty());
    }

    #[test]
    fn test_get_nonexistent_template() {
        let result = get_template("nonexistent_template");
        assert!(result.is_err());
    }

    #[test]
    fn test_list_template_ids() {
        let ids = list_template_ids();
        assert!(ids.contains(&"daily_standup".to_string()));
        assert!(ids.contains(&"standard_meeting".to_string()));
    }

    #[test]
    fn test_validate_invalid_json() {
        let result = validate_and_parse_template("invalid json");
        assert!(result.is_err());
    }
}
