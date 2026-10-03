use serde::{Deserialize, Serialize};

/// Represents a single section in a meeting template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateSection {
    /// Section title (e.g., "Summary", "Action Items")
    pub title: String,

    /// Instruction for the LLM on what to extract/include
    pub instruction: String,

    /// Format type: "paragraph", "list", or "string"
    pub format: String,

    /// Optional markdown formatting hint for list items (e.g., table structure)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_format: Option<String>,

    /// Alternative formatting hint
    #[serde(skip_serializing_if = "Option::is_none")]
    pub example_item_format: Option<String>,
}

/// Represents a complete meeting template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    /// Template display name
    pub name: String,

    /// Brief description of the template's purpose
    pub description: String,

    /// List of sections in the template
    pub sections: Vec<TemplateSection>,
}

impl Template {
    /// Validates the template structure
    pub fn validate(&self) -> Result<(), String> {
        if self.name.trim().is_empty() {
            return Err("Template name cannot be empty".to_string());
        }

        if self.description.trim().is_empty() {
            return Err("Template description cannot be empty".to_string());
        }

        if self.sections.is_empty() {
            return Err("Template must have at least one section".to_string());
        }

        for (i, section) in self.sections.iter().enumerate() {
            if section.title.trim().is_empty() {
                return Err(format!("Section {} has empty title", i));
            }

            if section.instruction.trim().is_empty() {
                return Err(format!("Section '{}' has empty instruction", section.title));
            }

            match section.format.trim() {
                "paragraph" | "list" | "string" => {},
                other => return Err(format!(
                    "Section '{}' has invalid format '{}'. Must be 'paragraph', 'list', or 'string'",
                    section.title, other
                )),
            }
        }

        Ok(())
    }

    /// Generates a clean markdown template structure
    pub fn to_markdown_structure(&self) -> String {
        let mut markdown = String::from("# <Add Title here>\n\n");

        for section in &self.sections {
            markdown.push_str(&format!("**{}**\n\n", section.title));
        }

        markdown
    }

    /// Generates section-specific instructions for the LLM
    pub fn to_section_instructions(&self) -> String {
        let mut instructions = String::from(
            "- **For the main title (`# [AI-Generated Title]`):** Analyze the entire transcript and create a concise, descriptive title for the meeting.\n"
        );

        for section in &self.sections {
            instructions.push_str(&format!(
                "- **For the '{}' section:** {}.\n",
                section.title, section.instruction
            ));

            let output_shape = match section.format.trim() {
                "paragraph" => "paragraph. Write prose paragraphs.",
                "list" => "list. Write a Markdown bullet list unless an item-format hint below specifies another structure.",
                "string" => "string. Write a single short line of text.",
                _ => "", // Invalid formats are rejected by template validation.
            };
            if !output_shape.is_empty() {
                instructions.push_str(&format!("  - Output format: {}\n", output_shape));
            }

            // Add item format instructions if present
            let item_format = section.item_format.as_ref()
                .or(section.example_item_format.as_ref());

            if let Some(format) = item_format {
                instructions.push_str(&format!(
                    "  - For list output, items in this section should follow the format: `{}`.\n",
                    format
                ));
            }
        }

        instructions
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn template_with_format(format: &str) -> Template {
        Template {
            name: "Format test".to_string(),
            description: "Same content, different output shape".to_string(),
            sections: vec![TemplateSection {
                title: "Summary".to_string(),
                instruction: "Summarize the discussion".to_string(),
                format: format.to_string(),
                item_format: None,
                example_item_format: None,
            }],
        }
    }

    #[test]
    fn section_instructions_distinguish_output_formats() {
        let paragraph = template_with_format("paragraph").to_section_instructions();
        let list = template_with_format("list").to_section_instructions();
        let short_text = template_with_format("string").to_section_instructions();

        assert!(paragraph.contains("Output format: paragraph. Write prose paragraphs."));
        assert!(list.contains("Output format: list. Write a Markdown bullet list"));
        assert!(list.contains("unless an item-format hint below specifies another structure."));
        assert!(short_text.contains("Output format: string. Write a single short line of text."));
        assert_ne!(paragraph, list);
        assert_ne!(paragraph, short_text);
        assert_ne!(list, short_text);

        // Legacy templates may have whitespace around a validated format.
        assert_eq!(
            paragraph,
            template_with_format(" paragraph ").to_section_instructions()
        );
    }

    #[test]
    fn section_instructions_preserve_item_format_hints() {
        let table_hint = "| Owner | Task |\n| --- | --- |";
        let example_hint = "**Owner**: Task";

        for format in ["paragraph", "list", "string"] {
            let mut template = template_with_format(format);
            template.sections[0].example_item_format = Some(example_hint.to_string());
            let instructions = template.to_section_instructions();
            assert!(instructions.contains("For list output, items in this section"));
            assert!(instructions.contains(&format!("follow the format: `{}`", example_hint)));
            assert!(instructions.contains(&format!("Output format: {}.", format)));

            // The explicit hint keeps precedence over its legacy alternative,
            // including multiline table hints used by built-in list sections.
            template.sections[0].item_format = Some(table_hint.to_string());
            let instructions = template.to_section_instructions();
            assert!(instructions.contains(&format!("follow the format: `{}`", table_hint)));
            assert!(!instructions.contains(example_hint));
            assert!(instructions.contains(&format!("Output format: {}.", format)));
        }
    }

    #[test]
    fn test_validate_valid_template() {
        let template = Template {
            name: "Test Template".to_string(),
            description: "A test template".to_string(),
            sections: vec![
                TemplateSection {
                    title: "Summary".to_string(),
                    instruction: "Provide a summary".to_string(),
                    format: "paragraph".to_string(),
                    item_format: None,
                    example_item_format: None,
                },
            ],
        };

        assert!(template.validate().is_ok());
    }

    #[test]
    fn test_validate_empty_name() {
        let template = Template {
            name: "".to_string(),
            description: "A test template".to_string(),
            sections: vec![],
        };

        assert!(template.validate().is_err());
    }

    #[test]
    fn test_validate_invalid_format() {
        let template = Template {
            name: "Test".to_string(),
            description: "Test".to_string(),
            sections: vec![
                TemplateSection {
                    title: "Test".to_string(),
                    instruction: "Test".to_string(),
                    format: "invalid".to_string(),
                    item_format: None,
                    example_item_format: None,
                },
            ],
        };

        assert!(template.validate().is_err());
    }
}
