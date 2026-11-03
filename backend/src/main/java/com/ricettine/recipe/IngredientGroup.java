package com.ricettine.recipe;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "ingredient_group")
public class IngredientGroup {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;
	private int position;
	private String name;
	@OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
	@JoinColumn(name = "group_id", nullable = false)
	@OrderBy("position")
	private List<Ingredient> ingredients = new ArrayList<>();

	protected IngredientGroup() {
	}

	public IngredientGroup(int position, String name) {
		this.position = position;
		this.name = name;
	}

	public int getPosition() { return position; }
	public String getName() { return name; }
	public List<Ingredient> getIngredients() { return ingredients; }
}
