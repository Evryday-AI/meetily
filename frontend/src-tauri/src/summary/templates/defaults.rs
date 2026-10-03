/// Embedded default templates using compile-time inclusion
///
/// These templates are bundled into the binary and serve as fallbacks
/// when custom templates are not available.

/// Daily standup template for engineering/product teams
pub const DAILY_STANDUP: &str = include_str!("../../../templates/daily_standup.json");

/// Standard meeting notes template
pub const STANDARD_MEETING: &str = include_str!("../../../templates/standard_meeting.json");

pub const RETROSPECTIVE: &str = include_str!("../../../templates/retrospective.json");
pub const CLIENT_CALL: &str = include_str!("../../../templates/client_call.json");
pub const INTERVIEW: &str = include_str!("../../../templates/interview.json");
pub const PROJECT_PLANNING: &str = include_str!("../../../templates/project_planning.json");

/// Registry of all built-in templates
///
/// Maps template identifiers to their embedded JSON content
pub fn get_builtin_templates() -> Vec<(&'static str, &'static str)> {
    vec![
        ("daily_standup", DAILY_STANDUP),
        ("standard_meeting", STANDARD_MEETING),
        ("retrospective", RETROSPECTIVE),
        ("client_call", CLIENT_CALL),
        ("interview", INTERVIEW),
        ("project_planning", PROJECT_PLANNING),
    ]
}

/// Get a built-in template by identifier
///
/// # Arguments
/// * `id` - Template identifier (e.g., "daily_standup", "standard_meeting")
///
/// # Returns
/// The template JSON content if found, None otherwise
pub fn get_builtin_template(id: &str) -> Option<&'static str> {
    get_builtin_templates().into_iter().find(|(template_id, _)| *template_id == id).map(|(_, content)| content)
}

/// List all built-in template identifiers
pub fn list_builtin_template_ids() -> Vec<&'static str> {
    get_builtin_templates().into_iter().map(|(id, _)| id).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builtin_templates_valid_json() {
        assert_eq!(get_builtin_templates().len(), 6);
        for (id, content) in get_builtin_templates() {
            let result = serde_json::from_str::<serde_json::Value>(content);
            assert!(
                result.is_ok(),
                "Built-in template '{}' contains invalid JSON: {:?}",
                id,
                result.err()
            );
        }
    }

    #[test]
    fn test_get_builtin_template() {
        assert!(get_builtin_template("daily_standup").is_some());
        assert!(get_builtin_template("standard_meeting").is_some());
        assert!(get_builtin_template("nonexistent").is_none());
    }
}
